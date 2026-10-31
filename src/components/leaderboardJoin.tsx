import { JSX, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { TextInput } from "./primitives/textInput";
import { Button } from "./button";
import { LibraryChips } from "./libraryChips";
import { ILibrarySex } from "../models/libraryTypes";

interface IProps {
  initialName?: string;
  onJoin: (displayName: string, sex: ILibrarySex) => Promise<void>;
}

export function LeaderboardJoin(props: IProps): JSX.Element {
  const [name, setName] = useState(props.initialName ?? "");
  const [sex, setSex] = useState<ILibrarySex>("male");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  return (
    <View className="py-2">
      <Text className="mb-1 text-base font-bold">Join the leaderboard</Text>
      <Text className="mb-3 text-sm text-text-secondary">
        After each workout, Lyteweight sends your best squat, bench and deadlift from sets of 5 reps or fewer, the
        kilograms you lifted, and your cardio. Others see your display name and weight class, never your exact
        bodyweight.
      </Text>
      <TextInput
        className="px-3 py-2 mb-3 border rounded-lg border-border-neutral bg-background-default"
        placeholder="Display name"
        value={name}
        onChangeText={setName}
        maxLength={30}
        testID="leaderboard-join-name"
      />
      <Text className="mb-2 text-xs text-text-secondary">Sex, for DOTS and weight classes</Text>
      <LibraryChips
        options={[
          ["male", "Male"],
          ["female", "Female"],
        ]}
        value={sex}
        onChange={setSex}
        testIdPrefix="leaderboard-join-sex"
      />
      {error && <Text className="mb-2 text-sm text-text-error">{error}</Text>}
      <Button
        name="leaderboard-join"
        kind="purple"
        disabled={isSaving}
        onClick={() => {
          setIsSaving(true);
          setError(undefined);
          props
            .onJoin(name, sex)
            .catch((e: Error) => setError(e.message))
            .finally(() => setIsSaving(false));
        }}
      >
        Join
      </Button>
    </View>
  );
}
