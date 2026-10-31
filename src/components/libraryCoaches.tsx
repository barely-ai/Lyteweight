import { JSX } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { ILibraryCoach } from "../models/libraryTypes";

interface IProps {
  coaches: ILibraryCoach[];
  onOpen: (libraryId: string) => void;
}

export function LibraryCoaches(props: IProps): JSX.Element {
  if (props.coaches.length === 0) {
    return (
      <Text className="py-8 text-sm text-center text-text-secondary">
        No coaches yet. Coaches are approved by the app owner and recommend programs here.
      </Text>
    );
  }
  return (
    <View>
      {props.coaches.map((coach) => (
        <View key={coach.id} className="p-3 mb-3 border rounded-xl bg-background-default border-border-cardpurple">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-bold">{coach.name}</Text>
            <Text className="px-2 text-xs font-bold rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
              VERIFIED COACH
            </Text>
          </View>
          <Text className="mt-1 text-sm text-text-secondary">{coach.bio}</Text>
          {coach.picks.length === 0 ? (
            <Text className="mt-2 text-xs text-text-secondary">No picks yet.</Text>
          ) : (
            coach.picks.map((pick) => (
              <Pressable
                key={pick.programId}
                className="pt-2 mt-2 border-t border-border-neutral"
                onPress={() => props.onOpen(pick.programId)}
              >
                <Text className="text-sm font-bold text-text-link">{pick.programName}</Text>
                <Text className="text-xs text-text-secondary">“{pick.note}”</Text>
              </Pressable>
            ))
          )}
        </View>
      ))}
    </View>
  );
}
