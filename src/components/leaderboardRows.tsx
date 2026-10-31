import { JSX } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { ILeaderboardRow } from "../models/libraryTypes";

interface IProps {
  rows: ILeaderboardRow[];
  unit: string;
  onReport: (row: ILeaderboardRow) => void;
}

const medalColors: Record<number, string> = { 1: "#d97706", 2: "#7c3aed", 3: "#0e7490" };
const podiumHeights: Record<number, number> = { 1: 150, 2: 128, 3: 112 };

function Podium(props: { rows: ILeaderboardRow[]; unit: string }): JSX.Element {
  const [first, second, third] = props.rows;
  const order = [second, first, third].filter((r): r is ILeaderboardRow => r != null);
  return (
    <View className="flex-row items-end gap-2 mb-4">
      {order.map((row) => (
        <View
          key={row.lifterId}
          className="items-center flex-1 px-2 pt-3 rounded-t-2xl rounded-b-md"
          style={{ backgroundColor: medalColors[row.rank], height: podiumHeights[row.rank] }}
        >
          <Text className="text-2xl font-bold text-text-alwayswhite">{row.rank}</Text>
          <Text className="text-xs font-bold text-center text-text-alwayswhite" numberOfLines={1}>
            {row.displayName}
          </Text>
          <Text className="mt-1 text-lg font-bold text-text-alwayswhite">{row.value.toLocaleString("en-US")}</Text>
          <Text className="text-xs text-text-alwayswhite">{props.unit}</Text>
        </View>
      ))}
    </View>
  );
}

export function LeaderboardRows(props: IProps): JSX.Element {
  if (props.rows.length === 0) {
    return <Text className="py-8 text-sm text-center text-text-secondary">No one on this board yet this week.</Text>;
  }
  return (
    <View>
      <Podium rows={props.rows.slice(0, 3)} unit={props.unit} />
      {props.rows.map((row) => (
        <View
          key={row.lifterId}
          className="flex-row items-center gap-3 px-3 py-2 mb-2 border rounded-xl bg-background-default border-border-cardpurple"
        >
          <Text className="w-7 text-base font-bold text-center">{row.rank}</Text>
          <View className="flex-1">
            <Text className="text-sm font-bold" numberOfLines={1}>
              {row.displayName} {row.source === "whoop" ? "⌚" : row.source === "manual" ? "✏️" : ""}
            </Text>
            <Text className="text-xs text-text-secondary">
              {row.weightClass} kg class · {row.detail}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-base font-bold text-text-purple">{row.value.toLocaleString("en-US")}</Text>
            <Pressable onPress={() => props.onReport(row)} testID={`leaderboard-report-${row.rank}`}>
              <Text className="text-xs text-text-secondary">Report</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
