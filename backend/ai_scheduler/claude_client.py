import logging

import anthropic
from django.conf import settings
from pydantic import ValidationError as PydanticValidationError

from .prompt_builder import SYSTEM_PROMPT, build_user_message
from .schemas import ScheduleOptimizationSchema

logger = logging.getLogger(__name__)

_client = None


def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


class OptimizationError(Exception):
    """Raised when Claude fails to produce a usable schedule after retrying."""


def _call_claude(user_message, extra_errors=None):
    messages = [{"role": "user", "content": user_message}]
    if extra_errors:
        messages.append({
            "role": "assistant",
            "content": "(previous malformed response omitted)",
        })
        messages.append({
            "role": "user",
            "content": (
                "Your previous response had the following problems, fix them and resend the "
                f"full JSON per the schema:\n{extra_errors}"
            ),
        })

    return get_client().messages.parse(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=messages,
        output_format=ScheduleOptimizationSchema,
    )


def _domain_validate(parsed: ScheduleOptimizationSchema, valid_task_ids, free_blocks, now):
    errors = []
    seen_task_ids = set()
    intervals = []

    for item in parsed.suggestions:
        if item.task_id not in valid_task_ids:
            errors.append(f"task_id={item.task_id} is not a valid pending task for this user.")
            continue
        if item.task_id in seen_task_ids:
            errors.append(f"task_id={item.task_id} appears more than once.")
            continue
        seen_task_ids.add(item.task_id)

        if item.proposed_end <= item.proposed_start:
            errors.append(f"task_id={item.task_id}: proposed_end must be after proposed_start.")
            continue
        if item.proposed_start < now:
            errors.append(f"task_id={item.task_id}: proposed_start is in the past.")
            continue

        within_free_block = any(
            item.proposed_start >= fb_start and item.proposed_end <= fb_end
            for fb_start, fb_end in free_blocks
        )
        if not within_free_block:
            errors.append(f"task_id={item.task_id}: proposed slot falls outside any offered free block.")
            continue

        for other_start, other_end in intervals:
            if item.proposed_start < other_end and other_start < item.proposed_end:
                errors.append(f"task_id={item.task_id}: proposed slot overlaps another suggested item.")
                break
        else:
            intervals.append((item.proposed_start, item.proposed_end))

    return errors


def request_schedule_optimization(owner, tasks, free_blocks, now):
    """tasks: iterable of Task instances; free_blocks: list of (start, end) datetimes.
    Returns a validated ScheduleOptimizationSchema. Raises OptimizationError on failure."""
    if not settings.ANTHROPIC_API_KEY:
        raise OptimizationError("ANTHROPIC_API_KEY is not configured on the server.")

    valid_task_ids = {t.id for t in tasks}
    user_message = build_user_message(now, owner.timezone, tasks, free_blocks)

    extra_errors = None
    last_errors = None
    for attempt in range(2):
        try:
            response = _call_claude(user_message, extra_errors=extra_errors)
        except anthropic.APIStatusError as exc:
            raise OptimizationError(f"Claude API error: {exc}") from exc
        except anthropic.APIConnectionError as exc:
            raise OptimizationError(f"Could not reach Claude API: {exc}") from exc
        except anthropic.AnthropicError as exc:
            raise OptimizationError(f"Claude request failed: {exc}") from exc
        except PydanticValidationError as exc:
            last_errors = str(exc)
            extra_errors = last_errors
            logger.warning("Schedule optimization JSON validation failed (attempt %s): %s", attempt + 1, last_errors)
            continue

        if response.stop_reason == "refusal":
            raise OptimizationError("Claude declined to generate a schedule for this request.")

        parsed = response.parsed_output
        if parsed is None:
            last_errors = "Claude response did not contain parsable structured output."
            extra_errors = last_errors
            continue

        errors = _domain_validate(parsed, valid_task_ids, free_blocks, now)
        if not errors:
            return parsed, response.model

        last_errors = "; ".join(errors)
        extra_errors = last_errors
        logger.warning("Schedule optimization validation failed (attempt %s): %s", attempt + 1, last_errors)

    raise OptimizationError(f"Claude's suggestions failed validation after retry: {last_errors}")
