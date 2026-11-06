import { useId, useState } from 'react'
import { MARGIN_STYLES, OPACITY_RANGE, PAPER_SPACING, PAPER_WEIGHTS } from '@cadence/shared/journal.js'
import { PAPER_COLORS, PATTERN_COLORS } from '../../lib/journalColors.js'
import { PAPER_PRESETS, PATTERN_META, canSnap, matchPreset, paperStyle, presetPaper } from '../../lib/journalPaper.js'
import { ColorPicker } from './ColorPicker.jsx'
import { PageIcon } from './journalIcons.jsx'
import { ToolPopover, TriggerButton } from './ToolbarParts.jsx'

/* The "Page" popover: everything about a note's paper.
 *
 * Every change is applied live — the sheet behind this panel repaints as a
 * slider moves — and the preset thumbnails are the real sheet CSS at a smaller
 * size (`.note-sheet--thumb`), fed by the same paperStyle() the page uses, so a
 * thumbnail can never promise something the page does not draw.
 */

const SPACINGS = [
  { label: 'Narrow', value: 22 },
  { label: 'Standard', value: 28 },
  { label: 'Wide', value: 34 },
]
const WEIGHTS = [
  { label: 'Fine', value: 1 },
  { label: 'Medium', value: 1.5 },
  { label: 'Bold', value: 2 },
]
const MARGINS = { none: 'None', single: 'Single', double: 'Double' }

function Chips({ label, options, value, onPick, disabled }) {
  return (
    <div className="filter-row paper-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-chip${option.value === value ? ' filter-chip--on' : ''}`}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Thumb({ paper }) {
  const { style, attrs } = paperStyle(paper)
  return <span className="note-sheet note-sheet--thumb" style={style} {...attrs} aria-hidden="true" />
}

function PaperForm({ paper, onChange, onUseForNew, onReset, close }) {
  const sliderId = useId()
  const opacityId = useId()
  const matched = matchPreset(paper)
  const snappable = canSnap(paper.pattern)
  const set = (patch) => onChange({ ...paper, ...patch })

  return (
    <div className="paper-form">
      <section className="paper-section">
        <h3 className="paper-section__title">Style</h3>
        <div className="paper-presets" role="group" aria-label="Paper styles">
          {PAPER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`paper-preset${matched?.id === preset.id ? ' paper-preset--on' : ''}`}
              aria-pressed={matched?.id === preset.id}
              onClick={() => onChange(presetPaper(preset))}
            >
              <Thumb paper={presetPaper(preset)} />
              <span className="paper-preset__label">{preset.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">Pattern</h3>
        <Chips
          label="Pattern"
          value={paper.pattern}
          onPick={(pattern) => set({ pattern })}
          options={PATTERN_META.map((p) => ({ label: p.label, value: p.id }))}
        />
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">Paper color</h3>
        <ColorPicker
          label="Paper colors"
          swatches={PAPER_COLORS}
          value={paper.paperColor === 'theme' ? null : paper.paperColor}
          clearLabel="Follow the app theme"
          recentKey="cadence-journal:recent-paper"
          onClear={() => set({ paperColor: 'theme' })}
          onPick={(paperColor) => set({ paperColor })}
          customLabel="Custom paper color"
        />
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">{paper.pattern === 'dots' || paper.pattern === 'isodots' ? 'Dot color' : 'Line color'}</h3>
        <ColorPicker
          label="Pattern colors"
          swatches={PATTERN_COLORS}
          value={paper.patternColor === 'auto' ? null : paper.patternColor}
          clearLabel="Automatic"
          recentKey="cadence-journal:recent-pattern"
          onClear={() => set({ patternColor: 'auto' })}
          onPick={(patternColor) => set({ patternColor })}
          customLabel="Custom pattern color"
        />
        <label className="paper-slider" htmlFor={opacityId}>
          <span>Strength</span>
          <input
            id={opacityId}
            type="range"
            min={OPACITY_RANGE.min * 100}
            max={OPACITY_RANGE.max * 100}
            step="5"
            value={Math.round(paper.patternOpacity * 100)}
            onChange={(event) => set({ patternOpacity: Number(event.target.value) / 100 })}
          />
          <output>{Math.round(paper.patternOpacity * 100)}%</output>
        </label>
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">Spacing</h3>
        <Chips
          label="Spacing"
          value={SPACINGS.find((s) => s.value === paper.spacing)?.value ?? null}
          onPick={(spacing) => set({ spacing })}
          options={SPACINGS}
        />
        <label className="paper-slider" htmlFor={sliderId}>
          <span>Fine tune</span>
          <input
            id={sliderId}
            type="range"
            min={PAPER_SPACING.min}
            max={PAPER_SPACING.max}
            step="1"
            value={paper.spacing}
            onChange={(event) => set({ spacing: Number(event.target.value) })}
          />
          <output>{paper.spacing}px</output>
        </label>
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">Line weight</h3>
        <Chips
          label="Line weight"
          value={paper.weight}
          onPick={(weight) => set({ weight })}
          options={WEIGHTS.filter((w) => PAPER_WEIGHTS.includes(w.value))}
        />
      </section>

      <section className="paper-section">
        <h3 className="paper-section__title">Margin line</h3>
        <Chips
          label="Margin line"
          value={paper.pattern === 'cornell' ? 'none' : paper.margin}
          disabled={paper.pattern === 'cornell'}
          onPick={(margin) => set({ margin })}
          options={MARGIN_STYLES.map((m) => ({ label: MARGINS[m], value: m }))}
        />
        {paper.margin !== 'none' && paper.pattern !== 'cornell' ? (
          <ColorPicker
            label="Margin colors"
            swatches={PATTERN_COLORS}
            value={paper.marginColor === 'auto' ? null : paper.marginColor}
            clearLabel="Automatic"
            recentKey="cadence-journal:recent-margin"
            onClear={() => set({ marginColor: 'auto' })}
            onPick={(marginColor) => set({ marginColor })}
            customLabel="Custom margin color"
          />
        ) : null}
      </section>

      <section className="paper-section">
        <label className="paper-check">
          <input
            type="checkbox"
            checked={paper.snap && snappable}
            disabled={!snappable}
            onChange={(event) => set({ snap: event.target.checked })}
          />
          <span>Snap text to the lines</span>
        </label>
        <p className="field__hint">
          {snappable
            ? 'Every line of text sits exactly on a rule, like writing on real ruled paper.'
            : 'Available on lined, dot, grid, graph and Cornell paper.'}
        </p>
      </section>

      <div className="paper-actions">
        <button type="button" className="ghost-button ghost-button--sm" onClick={onUseForNew}>
          Use for new notes
        </button>
        <button type="button" className="ghost-button ghost-button--sm" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="primary-button" onClick={close}>
          Done
        </button>
      </div>
    </div>
  )
}

export function PaperMenu({ paper, onChange, onUseForNew, onReset, disabled }) {
  const [open, setOpen] = useState(false)
  const width = typeof window === 'undefined' ? 360 : Math.min(360, window.innerWidth - 24)
  return (
    <ToolPopover
      open={open}
      onOpenChange={setOpen}
      label="Page and paper"
      width={width}
      maxHeight={560}
      className="tb-pop--paper"
      renderTrigger={(props) => (
        <TriggerButton {...props} icon={PageIcon} text="Page" label="Page and paper" disabled={disabled} />
      )}
    >
      {({ close }) => (
        <PaperForm paper={paper} onChange={onChange} onUseForNew={onUseForNew} onReset={onReset} close={close} />
      )}
    </ToolPopover>
  )
}

