import { JSX } from "react";
import { View } from "react-native";
import { GroupHeader } from "./groupHeader";
import { MenuItemEditable } from "./menuItemEditable";
import { Text } from "./primitives/text";
import { IDispatch } from "../ducks/types";
import { ILibraryStorage } from "../types";
import { LibraryActions_setCoachKey, LibraryActions_setUsageConsent } from "../models/libraryActions";

interface IProps {
  dispatch: IDispatch;
  library?: ILibraryStorage;
}

export function LibrarySettings(props: IProps): JSX.Element {
  return (
    <View>
      <GroupHeader name="Community settings" topPadding={true} />
      <MenuItemEditable
        type="boolean"
        name="Share anonymous usage"
        value={props.library?.usageConsent ? "true" : "false"}
        onChange={(v) => LibraryActions_setUsageConsent(props.dispatch, v === "true")}
      />
      <Text className="pb-2 text-xs text-text-secondary">
        Sends the community program, a random install id and the week when you finish a workout. It ranks programs by
        how long people run them.
      </Text>
      <MenuItemEditable
        type="text"
        name="Coach key"
        value={props.library?.coachKey ?? ""}
        onChange={(v) => LibraryActions_setCoachKey(props.dispatch, v ?? "")}
      />
      <Text className="pb-2 text-xs text-text-secondary">Only for coaches the app owner approved.</Text>
    </View>
  );
}
