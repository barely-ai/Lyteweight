import { JSX, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { TextInput } from "./primitives/textInput";
import { Button } from "./button";
import { LinkButton } from "./linkButton";
import { LibraryComments } from "./libraryComments";
import { useLibraryLoad } from "./useLibraryLoad";
import { useNavOptions } from "../navigation/useNavOptions";
import { IDispatch } from "../ducks/types";
import { IState } from "../models/state";
import { ILibraryStorage } from "../types";
import { ClipboardUtils_copy } from "../utils/clipboard";
import { Dialog_alert, Dialog_confirm } from "../utils/dialog";
import {
  ProgramLibrary_previewDays,
  ProgramLibrary_starsLabel,
  ProgramLibrary_visibleComments,
} from "../models/programLibrary";
import {
  LibraryActions_add,
  LibraryActions_comment,
  LibraryActions_detail,
  LibraryActions_hideAuthor,
  LibraryActions_rate,
  LibraryActions_recommend,
  LibraryActions_report,
  LibraryActions_shortLink,
} from "../models/libraryActions";

interface IProps {
  dispatch: IDispatch;
  state: IState;
  library?: ILibraryStorage;
  libraryId: string;
}

function showError(e: Error): void {
  Dialog_alert(e.message);
}

function StarPicker(props: { onRate: (stars: number) => void }): JSX.Element {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((stars) => (
        <Pressable key={stars} onPress={() => props.onRate(stars)} testID={`library-rate-${stars}`}>
          <Text className="text-2xl">★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ScreenLibraryProgram(props: IProps): JSX.Element {
  useNavOptions({ navTitle: "Community program" });
  const load = useLibraryLoad(() => LibraryActions_detail(props.libraryId), [props.libraryId]);
  const [note, setNote] = useState("");
  const library = props.library;
  const isAdded = library?.imports.some((i) => i.libraryId === props.libraryId) ?? false;

  if (load.isLoading || !load.data) {
    return (
      <Text className="py-8 text-sm text-center text-text-secondary" onPress={load.error ? load.reload : undefined}>
        {load.error ? `${load.error} Tap to retry.` : "Loading…"}
      </Text>
    );
  }
  const { summary, exported, comments } = load.data;
  const preview = ProgramLibrary_previewDays(exported);

  return (
    <View className="px-gutter pt-2 pb-8">
      <Text className="text-xl font-bold">{summary.name}</Text>
      <Text className="text-sm text-text-secondary">
        by {summary.author}
        {summary.tags.length > 0 ? ` · ${summary.tags.join(", ")}` : ""}
      </Text>
      <Text className="mt-1 text-sm text-text-secondary">
        {summary.lifterWeeks} lifter-weeks · {summary.liftersThisMonth} lifters this month ·{" "}
        {ProgramLibrary_starsLabel(summary)}
      </Text>
      {summary.description !== "" && <Text className="mt-3 text-sm">{summary.description}</Text>}
      {summary.coachPicks.map((pick) => (
        <View key={pick.coachName} className="p-3 mt-3 rounded-xl" style={{ backgroundColor: "#fef3c7" }}>
          <Text className="text-xs font-bold" style={{ color: "#92400e" }}>
            COACH PICK · {pick.coachName}
          </Text>
          <Text className="text-sm" style={{ color: "#78350f" }}>
            “{pick.note}”
          </Text>
        </View>
      ))}

      <View className="gap-2 mt-4">
        <Button
          name="library-add"
          kind="purple"
          onClick={() => LibraryActions_add(props.dispatch, props.state, load.data!).catch(showError)}
        >
          {isAdded ? "Add again" : "Add to my programs"}
        </Button>
        <Button
          name="library-share"
          kind="lightpurple"
          onClick={() => {
            const link = LibraryActions_shortLink(props.libraryId);
            ClipboardUtils_copy(link).then(() => Dialog_alert(`Link copied:\n\n${link}`));
          }}
        >
          Copy share link
        </Button>
      </View>

      <Text className="mt-6 mb-2 text-base font-bold">
        Preview{preview.weeksCount > 1 ? ` (week 1 of ${preview.weeksCount})` : ""}
      </Text>
      {preview.days.map((day) => (
        <View key={day.title} className="mb-3">
          <Text className="text-sm font-bold">{day.title}</Text>
          <Text className="text-sm text-text-secondary">{day.exercises.join(" · ")}</Text>
        </View>
      ))}

      <Text className="mt-4 mb-1 text-base font-bold">Rate it</Text>
      <Text className="mb-2 text-xs text-text-secondary">You can rate after finishing 3 workouts of this program.</Text>
      <StarPicker
        onRate={(stars) =>
          LibraryActions_rate(props.libraryId, stars)
            .then(() => {
              Dialog_alert(`Thanks for rating ${stars} ${stars === 1 ? "star" : "stars"}.`);
              load.reload();
            })
            .catch(showError)
        }
      />

      {library?.coachKey && (
        <View className="p-3 mt-4 border rounded-xl border-border-cardyellow">
          <Text className="mb-2 text-sm font-bold">Recommend as a coach</Text>
          <TextInput
            className="px-3 py-2 mb-2 border rounded-lg border-border-neutral bg-background-default"
            placeholder="Why you recommend it (280 characters)"
            value={note}
            onChangeText={setNote}
            maxLength={280}
          />
          <Button
            name="library-recommend"
            kind="orange"
            buttonSize="md"
            onClick={() =>
              LibraryActions_recommend(props.state, props.libraryId, note)
                .then(() => {
                  setNote("");
                  load.reload();
                })
                .catch(showError)
            }
          >
            Recommend
          </Button>
        </View>
      )}

      <View className="mt-6">
        <LibraryComments
          comments={ProgramLibrary_visibleComments(comments, library?.hiddenAuthorIds ?? [])}
          initialName={library?.displayName}
          canComment={isAdded}
          onPost={(name, body) =>
            LibraryActions_comment(props.dispatch, props.state, props.libraryId, name, body).then(load.reload)
          }
          onReport={async (comment) => {
            if (await Dialog_confirm("Report this comment?")) {
              LibraryActions_report("comment", comment.id).then(load.reload).catch(showError);
            }
          }}
          onHideAuthor={async (comment) => {
            if (await Dialog_confirm(`Hide all comments from ${comment.displayName} on this phone?`)) {
              LibraryActions_hideAuthor(props.dispatch, comment.authorId);
            }
          }}
        />
      </View>

      <View className="items-center mt-6">
        <LinkButton
          name="library-report-program"
          onClick={async () => {
            if (await Dialog_confirm("Report this program as spam, offensive, or copied without permission?")) {
              LibraryActions_report("program", props.libraryId)
                .then(() => Dialog_alert("Thanks. The owner will review it."))
                .catch(showError);
            }
          }}
        >
          Report this program
        </LinkButton>
      </View>
    </View>
  );
}
