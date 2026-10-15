import { TagGlyph } from './TagGlyph.jsx'

/** The plain `<select>` a task/event editor uses to assign a tag had no
    color in it anywhere — every other place a tag appears (the chip, the
    block, the tag list) leads with its swatch. `<option>` background colors
    aren't reliably stylable across browsers, so this shows the *selected*
    tag's color (or icon) as a dot beside the control instead, the one part
    of a native select a page can actually paint. */
export function TagSelect({ tags, value, onChange, id }) {
  const selected = tags.find((tag) => tag.id === value) ?? null

  return (
    <div className="tag-select">
      {selected ? (
        <TagGlyph tag={selected} variant="select" className="tag-select__dot" />
      ) : (
        <span className="tag-select__dot tag-select__dot--empty" aria-hidden="true" />
      )}
      <select
        id={id}
        className="input tag-select__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No tag</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  )
}
