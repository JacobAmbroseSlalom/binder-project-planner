// `ArtTransform`, `ArtDisplayGeometryInput`, `ArtDisplayGeometry`, and
// `computeArtDisplayGeometry` itself now live in
// `@binder-project-planner/shared` (story 29 needs the backend's PDF
// exporter to derive transformed image geometry from this exact same
// rotation/focal-point/scale-multiplier math) and are re-exported here so
// this route's existing imports keep working unchanged.
export {
  type ArtTransform,
  type ArtDisplayGeometryInput,
  type ArtDisplayGeometry,
  computeArtDisplayGeometry,
} from '@binder-project-planner/shared';
