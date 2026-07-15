import datetime as dt

from pydantic import BaseModel


class SuggestionItemSchema(BaseModel):
    task_id: int
    proposed_start: dt.datetime
    proposed_end: dt.datetime
    reasoning: str


class ScheduleOptimizationSchema(BaseModel):
    suggestions: list[SuggestionItemSchema]
    unscheduled_task_ids: list[int] = []
    overall_reasoning: str = ""
