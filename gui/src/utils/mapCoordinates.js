export const MIN_LONGITUDE = -180
export const MAX_LONGITUDE = 180
// Web Mercator reaches infinity at the geographic poles. MapLibre uses this
// finite latitude as the edge of its renderable world.
export const MAX_WEB_MERCATOR_LATITUDE = 85.051129
export const MIN_WEB_MERCATOR_LATITUDE = -MAX_WEB_MERCATOR_LATITUDE

function finitePosition(value) {
  const position = Array.isArray(value)
    ? value
    : [value?.lng ?? value?.longitude, value?.lat ?? value?.latitude]
  return position.length === 2 && position.every(Number.isFinite)
    ? position
    : null
}

/** Whether a position belongs to the canonical world renderable by MapLibre. */
export function isMapPosition(position) {
  return Array.isArray(position)
    && position.length === 2
    && position.every(coordinate => Number.isFinite(coordinate))
    && position[0] >= MIN_LONGITUDE
    && position[0] <= MAX_LONGITUDE
    && position[1] >= MIN_WEB_MERCATOR_LATITUDE
    && position[1] <= MAX_WEB_MERCATOR_LATITUDE
}

/**
 * Convert a MapLibre marker drag back into the durable project's world copy.
 *
 * MapLibre deliberately shifts marker longitudes by multiples of 360 while the
 * map is panned across world copies. The offset at drag start is display-only;
 * retaining it would either reject a harmless local drag or corrupt persisted
 * edge geometry. A drag that actually leaves the project's canonical world is
 * left out of bounds so the shared design validator can reject it explicitly.
 */
export function positionInProjectWorld(position, markerStart, projectStart) {
  const candidate = finitePosition(position)
  const displayedStart = finitePosition(markerStart)
  const durableStart = finitePosition(projectStart)
  if (!candidate || !displayedStart || !durableStart) {
    throw new Error('A map drag requires finite start and end positions.')
  }

  const worldOffset = Math.round(
    (displayedStart[0] - durableStart[0]) / 360,
  ) * 360
  return [candidate[0] - worldOffset, candidate[1]]
}
