import { BinderRouteProvider } from './BinderRouteContext';

// The binder route's special Next.js layout (story 7): mounts the shared
// `BinderRouteProvider` above the nested tab routes
// (details/layout/financials) so it loads once and stays mounted while the
// user switches tabs, per planning.md's "remains mounted while the user
// switches between them" requirement. A Server Component so it can `await`
// the dynamic route's `params` (Next.js 16) before handing the plain
// `binderId` string down to the client-side provider.
export default async function BinderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ binderId: string }>;
}) {
  const { binderId } = await params;

  return <BinderRouteProvider binderId={binderId}>{children}</BinderRouteProvider>;
}
