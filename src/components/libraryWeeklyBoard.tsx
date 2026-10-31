import { JSX } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { LibrarySparkline } from "./librarySparkline";
import { ILibraryWeeklyEntry } from "../models/libraryTypes";
import { ProgramLibrary_changeLabel, ProgramLibrary_starsLabel } from "../models/programLibrary";

interface IProps {
  week: string;
  entries: ILibraryWeeklyEntry[];
  onOpen: (libraryId: string) => void;
}

const podiumColors: Record<number, string> = { 1: "#d97706", 2: "#7c3aed", 3: "#0e7490" };
const podiumHeights: Record<number, number> = { 1: 176, 2: 150, 3: 132 };
const toneColors = { up: "#16a34a", down: "#dc2626", new: "#4f46e5", flat: "#9ca3af" };

function PodiumStep(props: { entry: ILibraryWeeklyEntry; onOpen: (id: string) => void }): JSX.Element {
  const { entry } = props;
  const change = ProgramLibrary_changeLabel(entry.change);
  return (
    <Pressable
      className="items-center flex-1 px-2 pt-3 pb-3 rounded-t-2xl rounded-b-md"
      style={{ backgroundColor: podiumColors[entry.rank], height: podiumHeights[entry.rank] }}
      onPress={() => props.onOpen(entry.program.id)}
      testID={`library-podium-${entry.rank}`}
    >
      <Text className="text-3xl font-bold text-text-alwayswhite">{entry.rank}</Text>
      <Text className="text-xs font-bold text-center text-text-alwayswhite" numberOfLines={2}>
        {entry.program.name}
      </Text>
      <Text className="mt-1 text-xl font-bold text-text-alwayswhite">{entry.liftersThisWeek}</Text>
      <Text className="text-xs text-text-alwayswhite">lifters · {change.text}</Text>
    </Pressable>
  );
}

function WeeklyCard(props: { entry: ILibraryWeeklyEntry; onOpen: (id: string) => void }): JSX.Element {
  const { entry } = props;
  const change = ProgramLibrary_changeLabel(entry.change);
  return (
    <Pressable
      className="flex-row items-center gap-3 px-3 py-3 mb-2 border rounded-xl bg-background-default border-border-cardpurple"
      onPress={() => props.onOpen(entry.program.id)}
      testID={`library-weekly-${entry.rank}`}
    >
      <View className="items-center w-8">
        <Text className="text-xl font-bold">{entry.rank}</Text>
        <Text className="text-xs font-bold" style={{ color: toneColors[change.tone] }}>
          {change.text}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold" numberOfLines={1}>
          {entry.program.name}
        </Text>
        {entry.program.coachPicks.length > 0 && (
          <Text className="text-xs font-bold" style={{ color: "#92400e" }}>
            COACH PICK
          </Text>
        )}
        <Text className="text-xs text-text-secondary">{ProgramLibrary_starsLabel(entry.program)}</Text>
      </View>
      <LibrarySparkline values={entry.sparkline} />
      <View className="items-end w-14">
        <Text className="text-lg font-bold text-text-purple">{entry.liftersThisWeek}</Text>
        <Text className="text-xs text-text-secondary">lifters</Text>
      </View>
    </Pressable>
  );
}

export function LibraryWeeklyBoard(props: IProps): JSX.Element {
  const top = props.entries.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]].filter((e): e is ILibraryWeeklyEntry => e != null);
  if (props.entries.length === 0) {
    return (
      <Text className="py-8 text-sm text-center text-text-secondary">
        No one has logged a community program this week yet. Add one and finish a workout to put it on the board.
      </Text>
    );
  }
  return (
    <View>
      <Text className="mb-3 text-xs text-text-secondary">
        Week {props.week} · ranked by lifters who trained this week
      </Text>
      <View className="flex-row items-end gap-2 mb-4">
        {podiumOrder.map((entry) => (
          <PodiumStep key={entry.program.id} entry={entry} onOpen={props.onOpen} />
        ))}
      </View>
      {props.entries.slice(3).map((entry) => (
        <WeeklyCard key={entry.program.id} entry={entry} onOpen={props.onOpen} />
      ))}
    </View>
  );
}
