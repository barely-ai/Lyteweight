import { JSX, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { useNavOptions } from "../navigation/useNavOptions";
import { IDispatch } from "../ducks/types";
import { IState } from "../models/state";
import { ILibraryStorage } from "../types";
import { Thunk_pushScreen } from "../ducks/thunks";
import { LibraryChips } from "./libraryChips";
import { LibraryWeeklyBoard } from "./libraryWeeklyBoard";
import { LibraryProgramList } from "./libraryProgramList";
import { LibraryCoaches } from "./libraryCoaches";
import { LeaderboardPanel } from "./leaderboardPanel";
import { LibrarySettings } from "./librarySettings";
import { useLibraryLoad } from "./useLibraryLoad";
import { LibraryActions_coaches, LibraryActions_list, LibraryActions_weekly } from "../models/libraryActions";

type ILibraryTab = "weekly" | "alltime" | "rated" | "coaches" | "leaderboard";

interface IProps {
  dispatch: IDispatch;
  state: IState;
  library?: ILibraryStorage;
}

function Status(props: { isLoading: boolean; error?: string; onRetry: () => void }): JSX.Element | null {
  if (props.isLoading) {
    return <Text className="py-8 text-sm text-center text-text-secondary">Loading…</Text>;
  }
  if (props.error) {
    return (
      <Text className="py-8 text-sm text-center text-text-error" onPress={props.onRetry}>
        {props.error} Tap to retry.
      </Text>
    );
  }
  return null;
}

function WeeklyTab(props: { onOpen: (id: string) => void }): JSX.Element {
  const load = useLibraryLoad(() => LibraryActions_weekly(), []);
  return (
    <>
      <Status isLoading={load.isLoading} error={load.error} onRetry={load.reload} />
      {load.data && !load.isLoading && (
        <LibraryWeeklyBoard week={load.data.week} entries={load.data.entries} onOpen={props.onOpen} />
      )}
    </>
  );
}

function ListTab(props: { sort: "alltime" | "rated"; onOpen: (id: string) => void }): JSX.Element {
  const load = useLibraryLoad(() => LibraryActions_list(props.sort), [props.sort]);
  return (
    <>
      <Status isLoading={load.isLoading} error={load.error} onRetry={load.reload} />
      {load.data && !load.isLoading && (
        <LibraryProgramList programs={load.data} metric={props.sort} onOpen={props.onOpen} />
      )}
    </>
  );
}

function CoachesTab(props: { onOpen: (id: string) => void }): JSX.Element {
  const load = useLibraryLoad(() => LibraryActions_coaches(), []);
  return (
    <>
      <Status isLoading={load.isLoading} error={load.error} onRetry={load.reload} />
      {load.data && !load.isLoading && <LibraryCoaches coaches={load.data} onOpen={props.onOpen} />}
    </>
  );
}

export function ScreenLibrary(props: IProps): JSX.Element {
  useNavOptions({ navTitle: "Community" });
  const [tab, setTab] = useState<ILibraryTab>("weekly");
  const open = (libraryId: string): void => {
    props.dispatch(Thunk_pushScreen("libraryProgram", { libraryId }));
  };
  return (
    <View className="px-gutter pt-2 pb-8">
      <LibraryChips<ILibraryTab>
        options={[
          ["weekly", "This week"],
          ["alltime", "All time"],
          ["rated", "Top rated"],
          ["coaches", "Coaches"],
          ["leaderboard", "Leaderboard"],
        ]}
        value={tab}
        onChange={setTab}
        testIdPrefix="library-tab"
      />
      {tab === "weekly" && <WeeklyTab onOpen={open} />}
      {(tab === "alltime" || tab === "rated") && <ListTab sort={tab} onOpen={open} />}
      {tab === "coaches" && <CoachesTab onOpen={open} />}
      {tab === "leaderboard" && (
        <LeaderboardPanel dispatch={props.dispatch} state={props.state} library={props.library} />
      )}
      <LibrarySettings dispatch={props.dispatch} library={props.library} />
    </View>
  );
}
