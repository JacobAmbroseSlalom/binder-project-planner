// The "Edit Layout" tab (story 7 routes to it; its real content -
// slot/card/art placement - is built out starting with story 8). Placeholder
// content only for now so the tab and its route exist and are selected by
// default after creating or opening a binder.
export default function BinderLayoutPage() {
  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <h1>Edit Layout</h1>
      <p className="text-body text-neutral-500">Layout editing is coming soon.</p>
    </div>
  );
}
