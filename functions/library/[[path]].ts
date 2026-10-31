import { ILibraryEnv, LibraryServer_handle } from "../../cloudflare/libraryServer";

// Cloudflare Pages routes every /library/* request here.
export const onRequest = (context: { request: Request; env: ILibraryEnv }): Promise<Response> =>
  LibraryServer_handle(context.request, context.env, Date.now());
