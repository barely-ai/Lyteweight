import { JSX } from "react";
import { Svg, Polyline } from "./primitives/svg";

export function LibrarySparkline(props: { values: number[]; width?: number; height?: number }): JSX.Element {
  const width = props.width ?? 72;
  const height = props.height ?? 28;
  const max = Math.max(1, ...props.values);
  const step = props.values.length > 1 ? width / (props.values.length - 1) : 0;
  const points = props.values.map((v, i) => `${i * step},${height - 2 - (v / max) * (height - 4)}`).join(" ");
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={points}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
