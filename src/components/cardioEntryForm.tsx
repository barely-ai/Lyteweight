import { JSX, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { LibraryTextInput } from "./libraryTextInput";
import { Button } from "./button";
import { LibraryChips } from "./libraryChips";

interface IProps {
  onSubmit: (
    activity: string,
    minutes: number,
    effort: number
  ) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
}

const efforts: [string, string][] = Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]);

export function CardioEntryForm(props: IProps): JSX.Element {
  const [activity, setActivity] = useState("");
  const [minutes, setMinutes] = useState("");
  const [effort, setEffort] = useState("6");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  return (
    <View className="p-3 mb-3 border rounded-xl border-border-neutral">
      <Text className="mb-2 text-sm font-bold">Add cardio by hand ✏️</Text>
      <View className="flex-row gap-2 mb-3">
        <LibraryTextInput
          style={{ flex: 1, minWidth: 0 }}
          placeholder="Activity, e.g. Run"
          value={activity}
          onChangeText={setActivity}
          maxLength={40}
          testID="cardio-activity"
        />
        <LibraryTextInput
          style={{ width: 96, flexShrink: 0 }}
          placeholder="Minutes"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          testID="cardio-minutes"
        />
      </View>
      <Text className="mb-2 text-xs text-text-secondary">Effort, 1 = easy walk, 10 = all-out</Text>
      <LibraryChips options={efforts} value={effort} onChange={setEffort} testIdPrefix="cardio-effort" />
      {message && (
        <Text className={`mb-2 text-sm ${message.isError ? "text-text-error" : "text-text-success"}`}>
          {message.text}
        </Text>
      )}
      <Button
        name="cardio-add"
        kind="purple"
        buttonSize="md"
        disabled={isSaving}
        onClick={() => {
          setIsSaving(true);
          props
            .onSubmit(activity, Number(minutes), Number(effort))
            .then((result) => {
              if (result.ok) {
                setActivity("");
                setMinutes("");
                setMessage({ text: "Added.", isError: false });
              } else {
                setMessage({ text: result.errors.join(" "), isError: true });
              }
            })
            .catch((e: Error) => setMessage({ text: e.message, isError: true }))
            .finally(() => setIsSaving(false));
        }}
      >
        Add cardio
      </Button>
    </View>
  );
}
