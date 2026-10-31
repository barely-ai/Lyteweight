import { JSX, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { TextInput } from "./primitives/textInput";
import { ILibraryProgramSummary } from "../models/libraryTypes";
import { ProgramLibrary_filter, ProgramLibrary_starsLabel } from "../models/programLibrary";

interface IProps {
  programs: ILibraryProgramSummary[];
  metric: "alltime" | "rated";
  onOpen: (libraryId: string) => void;
}

export function LibraryProgramList(props: IProps): JSX.Element {
  const [query, setQuery] = useState("");
  const shown = ProgramLibrary_filter(props.programs, query);
  return (
    <View>
      <TextInput
        className="px-3 py-2 mb-3 border rounded-lg border-border-neutral bg-background-default"
        placeholder="Search name, author or tag"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="library-search"
      />
      {shown.length === 0 && (
        <Text className="py-8 text-sm text-center text-text-secondary">
          {props.programs.length === 0
            ? "No community programs yet. Publish one from its program menu."
            : "No matches."}
        </Text>
      )}
      {shown.map((program, i) => (
        <Pressable
          key={program.id}
          className="flex-row items-center gap-3 px-3 py-3 mb-2 border rounded-xl bg-background-default border-border-cardpurple"
          onPress={() => props.onOpen(program.id)}
          testID={`library-program-${program.id}`}
        >
          <Text className="w-6 text-base font-bold text-center">{i + 1}</Text>
          <View className="flex-1">
            <Text className="text-sm font-bold" numberOfLines={1}>
              {program.name}
            </Text>
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              by {program.author}
              {program.tags.length > 0 ? ` · ${program.tags.join(", ")}` : ""}
            </Text>
            <Text className="text-xs text-text-secondary">{ProgramLibrary_starsLabel(program)}</Text>
          </View>
          <View className="items-end">
            {props.metric === "alltime" ? (
              <>
                <Text className="text-lg font-bold text-text-purple">{program.lifterWeeks}</Text>
                <Text className="text-xs text-text-secondary">lifter-weeks</Text>
                <Text className="text-xs text-text-secondary">{program.liftersThisMonth} this month</Text>
              </>
            ) : (
              <>
                <Text className="text-lg font-bold text-text-purple">
                  {program.starsAverage != null ? program.starsAverage.toFixed(1) : "–"}
                </Text>
                <Text className="text-xs text-text-secondary">stars</Text>
              </>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
