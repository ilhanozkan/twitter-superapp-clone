import { IStage } from "../../types/Superapp";
import LocalTime from "./LocalTime";

/**
 * Progress steps as an ordered list: reached steps show their time, and the
 * latest reached one is the current step (aria-current="step").
 */
export default function StageList<S extends string>({
  stages,
}: {
  stages: IStage<S>[];
}) {
  const current = stages.findLastIndex((stage) => stage.reached);

  return (
    <ol className="flex flex-col gap-3">
      {stages.map((stage, index) => (
        <li
          key={stage.status}
          aria-current={index === current ? "step" : undefined}
          className="flex items-center gap-3 text-[15px]"
        >
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${
              stage.reached ? "bg-primary" : "border-2 border-line"
            }`}
          />
          <span className={`flex-1 ${index === current ? "font-bold" : ""}`}>
            {stage.label}
          </span>
          <span className="text-[13px] text-muted">
            {stage.reached ? (
              <LocalTime iso={stage.at} />
            ) : (
              <>
                <span className="sr-only">expected </span>
                <LocalTime iso={stage.at} />
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
