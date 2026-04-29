"use client";

import { useRef, useState } from "react";
import {
  TEMPLATE_SLUG_BY_TEXT_TYPE,
  type WeeklyTextTypeValue,
} from "@/features/weekly-texts/constants";

export type WeeklyTextUploadMode = "file" | "markdown";

export const NONE_SELECT_VALUE = "__none__";

type UseWeeklyTextUploadFormOptions = {
  initialCohortId?: string | null;
};

type TemplateContentResponse = {
  body: string;
  title: string;
};

export function useWeeklyTextUploadForm(options?: UseWeeklyTextUploadFormOptions) {
  const initialCohortId = options?.initialCohortId ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestSequenceRef = useRef(0);

  const [uploadMode, setUploadMode] = useState<WeeklyTextUploadMode>("file");
  const [title, setTitle] = useState("");
  const [textType, setTextType] = useState<WeeklyTextTypeValue | null>(null);
  const [cohortId, setCohortId] = useState<string>(initialCohortId ?? NONE_SELECT_VALUE);
  const [body, setBody] = useState("");
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cancelTemplateRequest = () => {
    requestSequenceRef.current += 1;
    setIsTemplateLoading(false);
  };

  const loadTemplateBody = async (nextTextType: WeeklyTextTypeValue) => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setIsTemplateLoading(true);
    setTemplateError(null);

    try {
      const slug = TEMPLATE_SLUG_BY_TEXT_TYPE[nextTextType];
      const response = await fetch(`/api/templates/${slug}/content`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("template-load-failed");
      }

      const payload = (await response.json()) as TemplateContentResponse;

      if (requestSequenceRef.current !== requestId) {
        return;
      }

      setBody(payload.body);
    } catch (error) {
      if (requestSequenceRef.current !== requestId) {
        return;
      }

      console.error("[weekly-text-upload] 템플릿 불러오기 실패:", error);
      setBody("");
      setTemplateError("템플릿을 불러오지 못했습니다. 직접 작성해 주세요.");
    } finally {
      if (requestSequenceRef.current === requestId) {
        setIsTemplateLoading(false);
      }
    }
  };

  const switchUploadMode = (nextMode: WeeklyTextUploadMode) => {
    if (nextMode === uploadMode) {
      return;
    }

    cancelTemplateRequest();
    resetFileInput();
    setTemplateError(null);
    setBody("");
    setUploadMode(nextMode);

    if (nextMode === "markdown" && textType) {
      void loadTemplateBody(textType);
    }
  };

  const handleTextTypeChange = (value: string | null) => {
    const nextTextType =
      value && value !== NONE_SELECT_VALUE ? (value as WeeklyTextTypeValue) : null;

    setTextType(nextTextType);
    setTemplateError(null);

    if (uploadMode !== "markdown") {
      return;
    }

    cancelTemplateRequest();

    if (!nextTextType) {
      setBody("");
      return;
    }

    void loadTemplateBody(nextTextType);
  };

  const resetForm = () => {
    cancelTemplateRequest();
    resetFileInput();
    setUploadMode("file");
    setTitle("");
    setTextType(null);
    setCohortId(initialCohortId ?? NONE_SELECT_VALUE);
    setBody("");
    setTemplateError(null);
  };

  return {
    body,
    cohortId,
    fileInputRef,
    isTemplateLoading,
    setBody,
    setCohortId,
    setTitle,
    switchUploadMode,
    templateError,
    textType,
    title,
    uploadMode,
    resetForm,
    handleTextTypeChange,
  };
}
