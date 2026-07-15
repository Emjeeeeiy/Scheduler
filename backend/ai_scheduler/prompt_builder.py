import json

SYSTEM_PROMPT = """You are a scheduling assistant that optimizes a user's to-do list against their \
free time on the calendar.

You will be given:
- "tasks": a list of pending tasks, each with id, title, priority (low/medium/high/urgent), \
deadline (ISO-8601 or null), estimated_duration_minutes (integer or null), and category.
- "free_blocks": a list of free time windows on the calendar, each with start and end (ISO-8601).

Your job is to propose start/end times for as many tasks as sensibly fit into the free blocks, \
following these rules:
1. Never propose a slot that overlaps another proposed slot.
2. Never propose a slot that falls outside the bounds of one of the given free blocks.
3. Prefer scheduling higher-priority tasks and tasks with nearer deadlines earlier.
4. Respect each task's estimated_duration_minutes for the length of its proposed slot. If a task \
has no estimated_duration_minutes, use your best conservative estimate based on its title/description.
5. Do not split a single task across multiple slots. If a task cannot fit whole into any remaining \
free block, leave it out of "suggestions" and list its id in "unscheduled_task_ids" instead, with \
a brief reason folded into "overall_reasoning".
6. Every proposed_start/proposed_end must be a specific ISO-8601 datetime, not a date range.

Return your answer as JSON matching this exact schema:
{
  "suggestions": [
    {"task_id": <int>, "proposed_start": "<ISO-8601>", "proposed_end": "<ISO-8601>", "reasoning": "<string>"}
  ],
  "unscheduled_task_ids": [<int>, ...],
  "overall_reasoning": "<string>"
}
"""


def build_user_message(now, user_timezone, tasks, free_blocks):
    tasks_payload = [
        {
            "id": t.id,
            "title": t.title,
            "priority": t.priority,
            "deadline": t.deadline.isoformat() if t.deadline else None,
            "estimated_duration_minutes": t.estimated_duration_minutes,
            "category": t.category.name if t.category_id else None,
        }
        for t in tasks
    ]
    free_blocks_payload = [
        {"start": start.isoformat(), "end": end.isoformat()} for start, end in free_blocks
    ]

    return (
        f"Current date/time: {now.isoformat()}\n"
        f"User timezone: {user_timezone}\n\n"
        f"tasks = {json.dumps(tasks_payload, indent=2)}\n\n"
        f"free_blocks = {json.dumps(free_blocks_payload, indent=2)}\n\n"
        "Return only the structured JSON per the schema in the system prompt."
    )
