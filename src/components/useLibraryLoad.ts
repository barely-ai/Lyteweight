import { DependencyList, useCallback, useEffect, useState } from "react";

export interface ILibraryLoad<T> {
  data?: T;
  error?: string;
  isLoading: boolean;
  reload: () => void;
}

export function useLibraryLoad<T>(load: () => Promise<T>, deps: DependencyList): ILibraryLoad<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setError(undefined);
    load().then(
      (result) => {
        if (isCurrent) {
          setData(result);
          setIsLoading(false);
        }
      },
      (e: Error) => {
        if (isCurrent) {
          setError(e.message);
          setIsLoading(false);
        }
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, isLoading, reload };
}
