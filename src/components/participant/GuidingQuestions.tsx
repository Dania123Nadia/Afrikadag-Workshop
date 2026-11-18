import { MessageSquareQuote } from "lucide-react";
import { LEVEL_LABEL } from "@/lib/content";
import type { ParticipantState } from "@/lib/useParticipantWorkshop";

/** The guiding questions for the participant's stakeholder group, shown in the reference booklet. */
export function GuidingQuestions({ questions }: { questions: ParticipantState["questions"] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Use these to structure your discussion. You don't need to answer them one by one.</p>
      <ol className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
            <MessageSquareQuote className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
            <div>
              <p className="text-[15px] font-medium text-ink">{q.text}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Q{i + 1} · {LEVEL_LABEL[q.level]}</p>
            </div>
          </li>
        ))}
        {questions.length === 0 && <li className="text-sm text-muted">No questions for this group.</li>}
      </ol>
    </div>
  );
}
