import { JSX, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { TextInput } from "./primitives/textInput";
import { Button } from "./button";
import { LinkButton } from "./linkButton";
import { useNavOptions } from "../navigation/useNavOptions";
import { IDispatch } from "../ducks/types";
import { IState } from "../models/state";
import { ILibraryStorage } from "../types";
import { ClipboardUtils_copy } from "../utils/clipboard";
import { Dialog_alert, Dialog_confirm } from "../utils/dialog";
import { LibraryActions_publish, LibraryActions_unpublish } from "../models/libraryActions";

interface IProps {
  dispatch: IDispatch;
  state: IState;
  library?: ILibraryStorage;
  programId: string;
}

const inputCn = "px-3 py-2 mb-3 border rounded-lg border-border-neutral bg-background-default";

export function ScreenLibraryPublish(props: IProps): JSX.Element {
  useNavOptions({ navTitle: "Publish to Community" });
  const program = props.state.storage.programs.find((p) => p.id === props.programId);
  const publication = props.library?.publications.find((p) => p.programId === props.programId);
  const [name, setName] = useState(program?.name ?? "");
  const [author, setAuthor] = useState(props.library?.displayName ?? "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [ownsRights, setOwnsRights] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [link, setLink] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  if (!program) {
    return <Text className="py-8 text-sm text-center text-text-secondary">Program not found.</Text>;
  }

  return (
    <View className="px-gutter pt-2 pb-8">
      <Text className="mb-3 text-sm text-text-secondary">
        {publication
          ? "This program is in the community library. Publishing again replaces it with your current version."
          : "Everyone using Lyteweight can find, add, rate and comment on published programs."}
      </Text>
      <Text className="mb-1 text-xs font-bold">Program name</Text>
      <TextInput className={inputCn} value={name} onChangeText={setName} maxLength={80} testID="publish-name" />
      <Text className="mb-1 text-xs font-bold">Your name, as shown to others</Text>
      <TextInput className={inputCn} value={author} onChangeText={setAuthor} maxLength={40} testID="publish-author" />
      <Text className="mb-1 text-xs font-bold">Description</Text>
      <TextInput
        className={inputCn}
        value={description}
        onChangeText={setDescription}
        multiline={true}
        maxLength={2000}
        style={{ minHeight: 96, textAlignVertical: "top" }}
        placeholder="Who it's for, how long it runs, what to expect"
        testID="publish-description"
      />
      <Text className="mb-1 text-xs font-bold">Tags, separated by commas (up to 5)</Text>
      <TextInput
        className={inputCn}
        value={tags}
        onChangeText={setTags}
        placeholder="powerlifting, 4-day, peaking"
        autoCapitalize="none"
        testID="publish-tags"
      />
      <Pressable
        className="flex-row items-start gap-2 mb-4"
        onPress={() => setOwnsRights(!ownsRights)}
        testID="publish-rights"
      >
        <Text className="text-lg">{ownsRights ? "☑" : "☐"}</Text>
        <Text className="flex-1 text-sm">
          I wrote this program, or it is freely published by its author. I'm not copying a paid program.
        </Text>
      </Pressable>
      {errors.map((e) => (
        <Text key={e} className="mb-1 text-sm text-text-error">
          {e}
        </Text>
      ))}
      <Button
        name="publish-submit"
        kind="purple"
        disabled={isSaving}
        onClick={() => {
          setIsSaving(true);
          setErrors([]);
          LibraryActions_publish(props.dispatch, props.state, props.programId, {
            name,
            author,
            description,
            tags: tags.split(","),
            ownsRights,
          })
            .then((result) => (result.ok ? setLink(result.link) : setErrors(result.errors)))
            .catch((e: Error) => setErrors([e.message]))
            .finally(() => setIsSaving(false));
        }}
      >
        {publication ? "Publish new version" : "Publish"}
      </Button>
      {link && (
        <View className="p-3 mt-4 rounded-xl bg-background-subtlecardpurple">
          <Text className="mb-1 text-sm font-bold">Published</Text>
          <Text className="mb-2 text-sm text-text-link" onPress={() => ClipboardUtils_copy(link)}>
            {link}
          </Text>
          <Text className="text-xs text-text-secondary">Tap the link to copy it and send it to a friend.</Text>
        </View>
      )}
      {publication && (
        <View className="items-center mt-6">
          <LinkButton
            name="publish-remove"
            onClick={async () => {
              if (
                await Dialog_confirm("Remove this program from the community library? Ratings and comments go too.")
              ) {
                LibraryActions_unpublish(props.dispatch, props.state, props.programId)
                  .then(() => Dialog_alert("Removed."))
                  .catch((e: Error) => Dialog_alert(e.message));
              }
            }}
          >
            Remove from the library
          </LinkButton>
        </View>
      )}
    </View>
  );
}
