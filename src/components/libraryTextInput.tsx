import { JSX } from "react";
import { TextInputProps } from "react-native";
import { TextInput } from "./primitives/textInput";
import { Tailwind_semantic } from "../utils/tailwindConfig";

export function LibraryTextInput(props: TextInputProps & { className?: string }): JSX.Element {
  return (
    <TextInput
      placeholderTextColor={Tailwind_semantic().text.secondarysubtle}
      {...props}
      className={`px-3 py-2 border rounded-lg border-border-neutral bg-background-default text-text-primary ${props.className ?? ""}`}
    />
  );
}
