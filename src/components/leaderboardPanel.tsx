import { JSX, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { LinkButton } from "./linkButton";
import { LibraryChips } from "./libraryChips";
import { LeaderboardRows } from "./leaderboardRows";
import { LeaderboardJoin } from "./leaderboardJoin";
import { CardioEntryForm } from "./cardioEntryForm";
import { useLibraryLoad } from "./useLibraryLoad";
import { IDispatch } from "../ducks/types";
import { IState } from "../models/state";
import { ILibraryStorage } from "../types";
import { Dialog_alert, Dialog_confirm } from "../utils/dialog";
import { LibraryRules_weightClasses } from "../models/libraryRules";
import {
  ILeaderboardSelection,
  LeaderboardView_allClasses,
  LeaderboardView_board,
  LeaderboardView_initial,
  LeaderboardView_unit,
  LeaderboardView_withSex,
} from "../models/leaderboardView";
import {
  LibraryActions_addManualCardio,
  LibraryActions_joinLeaderboard,
  LibraryActions_leaderboard,
  LibraryActions_leaveLeaderboard,
  LibraryActions_report,
} from "../models/libraryActions";
import { ILibraryBoardLift, ILibrarySex } from "../models/libraryTypes";

interface IProps {
  dispatch: IDispatch;
  state: IState;
  library?: ILibraryStorage;
}

export function LeaderboardPanel(props: IProps): JSX.Element {
  const library = props.library;
  const [selection, setSelection] = useState<ILeaderboardSelection>(() =>
    LeaderboardView_initial(library?.leaderboard?.sex)
  );
  const board = LeaderboardView_board(selection);
  const load = useLibraryLoad(() => LibraryActions_leaderboard(board), [JSON.stringify(board)]);
  const update = (patch: Partial<ILeaderboardSelection>): void => setSelection((s) => ({ ...s, ...patch }));

  if (!library?.leaderboard) {
    return (
      <LeaderboardJoin
        initialName={library?.displayName}
        onJoin={(name, sex) => LibraryActions_joinLeaderboard(props.dispatch, props.state, name, sex)}
      />
    );
  }

  return (
    <View>
      <LibraryChips
        options={[
          ["resistance", "Resistance"],
          ["cardio", "Cardio"],
        ]}
        value={selection.section}
        onChange={(section) => update({ section })}
        testIdPrefix="leaderboard-section"
      />
      {selection.section === "resistance" ? (
        <>
          <LibraryChips
            options={[
              ["strength", "Strength (DOTS)"],
              ["volume", "Volume this week"],
            ]}
            value={selection.resistance}
            onChange={(resistance) => update({ resistance })}
            testIdPrefix="leaderboard-resistance"
          />
          <LibraryChips<ILibrarySex>
            options={[
              ["male", "Men"],
              ["female", "Women"],
            ]}
            value={selection.sex}
            onChange={(sex) => setSelection((s) => LeaderboardView_withSex(s, sex))}
            testIdPrefix="leaderboard-sex"
          />
          {selection.resistance === "strength" && (
            <>
              <LibraryChips<ILibraryBoardLift>
                options={[
                  ["total", "Total"],
                  ["squat", "Squat"],
                  ["bench", "Bench"],
                  ["deadlift", "Deadlift"],
                ]}
                value={selection.lift}
                onChange={(lift) => update({ lift })}
                testIdPrefix="leaderboard-lift"
              />
              <LibraryChips
                options={[
                  [LeaderboardView_allClasses, "All classes"],
                  ...LibraryRules_weightClasses(selection.sex).map((c): [string, string] => [c, `${c} kg`]),
                ]}
                value={selection.weightClass}
                onChange={(weightClass) => update({ weightClass })}
                testIdPrefix="leaderboard-class"
              />
            </>
          )}
        </>
      ) : (
        <>
          <LibraryChips
            options={[
              ["zoneMinutes", "Zone-minutes"],
              ["kcalPerKg", "Calories per kg"],
            ]}
            value={selection.cardioSort}
            onChange={(cardioSort) => update({ cardioSort })}
            testIdPrefix="leaderboard-cardio-sort"
          />
          <CardioEntryForm
            onSubmit={(activity, minutes, effort) =>
              LibraryActions_addManualCardio(activity, minutes, effort).then((result) => {
                load.reload();
                return result;
              })
            }
          />
        </>
      )}
      {load.isLoading && <Text className="py-6 text-sm text-center text-text-secondary">Loading…</Text>}
      {load.error && <Text className="py-6 text-sm text-center text-text-error">{load.error}</Text>}
      {load.data && !load.isLoading && (
        <LeaderboardRows
          rows={load.data}
          unit={LeaderboardView_unit(selection)}
          onReport={async (row) => {
            if (await Dialog_confirm(`Report ${row.displayName} for fake numbers?`)) {
              LibraryActions_report("lifter", row.lifterId)
                .then(() => Dialog_alert("Thanks. The owner will review it."))
                .catch((e: Error) => Dialog_alert(e.message));
            }
          }}
        />
      )}
      <View className="items-center py-4">
        <LinkButton
          name="leaderboard-leave"
          onClick={async () => {
            if (await Dialog_confirm("Stop sending your workouts to the leaderboard?")) {
              LibraryActions_leaveLeaderboard(props.dispatch);
            }
          }}
        >
          Leave the leaderboard
        </LinkButton>
      </View>
    </View>
  );
}
