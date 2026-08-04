// Public entry point for the app-wide navigation header, rendered once in
// RootLayout so every page has a consistent way back to the home page.
export { AppHeader } from './AppHeader';
// Lets a page set the title shown in the app header bar (e.g. the binder
// view/edit pages show the binder name there).
export {
  AppHeaderTitleProvider,
  useSetAppHeaderTitle,
} from './AppHeaderTitle';
