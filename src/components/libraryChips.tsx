import { JSX } from "react";
import { Pressable, ScrollView } from "react-native";
import { Text } from "./primitives/text";

interface IProps<T extends string> {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
}

export function LibraryChips<T extends string>(props: IProps<T>): JSX.Element {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
      {props.options.map(([value, label]) => {
        const isOn = value === props.value;
        return (
          <Pressable
            key={value}
            className={`px-3 py-2 rounded-full ${isOn ? "bg-button-primarybackground" : "bg-background-subtlecardpurple"}`}
            onPress={() => props.onChange(value)}
            testID={`${props.testIdPrefix}-${value}`}
          >
            <Text className={`text-xs font-bold ${isOn ? "text-text-alwayswhite" : "text-text-purple"}`}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
