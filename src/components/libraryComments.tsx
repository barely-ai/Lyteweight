import { JSX, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { LibraryTextInput } from "./libraryTextInput";
import { Button } from "./button";
import { ILibraryComment } from "../models/libraryTypes";

interface IProps {
  comments: ILibraryComment[];
  initialName?: string;
  canComment: boolean;
  onPost: (displayName: string, body: string) => Promise<void>;
  onReport: (comment: ILibraryComment) => void;
  onHideAuthor: (comment: ILibraryComment) => void;
}

export function LibraryComments(props: IProps): JSX.Element {
  const [name, setName] = useState(props.initialName ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPosting, setIsPosting] = useState(false);
  return (
    <View>
      <Text className="mb-2 text-base font-bold">Comments</Text>
      {props.canComment ? (
        <View className="p-3 mb-3 border rounded-xl border-border-neutral">
          <LibraryTextInput
            className="mb-2"
            placeholder="Your display name"
            value={name}
            onChangeText={setName}
            maxLength={30}
            testID="library-comment-name"
          />
          <LibraryTextInput
            className="mb-2"
            placeholder="How did this program go for you?"
            value={body}
            onChangeText={setBody}
            multiline={true}
            maxLength={1000}
            style={{ minHeight: 72, textAlignVertical: "top" }}
            testID="library-comment-body"
          />
          {error && <Text className="mb-2 text-sm text-text-error">{error}</Text>}
          <Button
            name="library-comment-post"
            kind="purple"
            buttonSize="md"
            disabled={isPosting}
            onClick={() => {
              setIsPosting(true);
              setError(undefined);
              props
                .onPost(name, body)
                .then(() => setBody(""))
                .catch((e: Error) => setError(e.message))
                .finally(() => setIsPosting(false));
            }}
          >
            Post comment
          </Button>
        </View>
      ) : (
        <Text className="mb-3 text-sm text-text-secondary">Add this program to comment on it.</Text>
      )}
      {props.comments.length === 0 && <Text className="text-sm text-text-secondary">No comments yet.</Text>}
      {props.comments.map((comment) => (
        <View key={comment.id} className="py-3 border-b border-border-neutral">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold">{comment.displayName}</Text>
            {comment.isCoach && (
              <Text className="px-2 text-xs font-bold rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                COACH
              </Text>
            )}
            <Text className="text-xs text-text-secondary">{new Date(comment.createdAt).toLocaleDateString()}</Text>
          </View>
          <Text className="mt-1 text-sm">{comment.body}</Text>
          <View className="flex-row gap-4 mt-1">
            <Pressable onPress={() => props.onReport(comment)}>
              <Text className="text-xs text-text-secondary">Report</Text>
            </Pressable>
            <Pressable onPress={() => props.onHideAuthor(comment)}>
              <Text className="text-xs text-text-secondary">Hide this person</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
