export const WEEKLY_TEXT_TYPE_VALUES = ["고전명작", "경영서", "기업실무"] as const;

export type WeeklyTextTypeValue = (typeof WEEKLY_TEXT_TYPE_VALUES)[number];

export const TEMPLATE_SLUG_BY_TEXT_TYPE: Record<WeeklyTextTypeValue, string> = {
  고전명작: "classic-book",
  경영서: "management-book",
  기업실무: "business-practice",
};
