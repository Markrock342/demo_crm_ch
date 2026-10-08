import { Archive, ArrowCounterClockwise, Check, ImageSquare, Plus, Prohibit, TreeStructure } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Popover, Tooltip } from "antd";
import { useState } from "react";
import { UNIT_IMAGES, createBusinessUnit, patchBusinessUnit, type BusinessUnit, type BusinessUnitInput, type UnitColor } from "../../api/businessUnits.ts";
import { useStore } from "../../store";
import { EmptyState, IconBadge, LoadingState, Panel } from "../../v2/components";
import { PhotoCreditsLink } from "../../v2/components/PhotoCredits.tsx";
import { UnitSwatches } from "../../v2/components/UnitPicker.tsx";
import { UNIT_TONE } from "../../v2/lib/unitLook.ts";
import { unitThumb } from "../../v2/lib/photos.ts";
import { businessUnitsKey, useBusinessUnits } from "../../v2/hooks/useBusinessUnits.ts";
import "./business-units.css";

/** Settings › Business units (ธุรกิจในเครือ), admins: rename, color, archive / restore, add. */
export function BusinessUnitsSection() {
  const { tx } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useBusinessUnits(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<UnitColor>("teal");
  const [newImage, setNewImage] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: businessUnitsKey });

  async function patch(id: string, p: BusinessUnitInput) {
    try {
      await patchBusinessUnit(id, p);
      await refresh();
      return true;
    } catch {
      message.error(tx("inb_error"));
      return false;
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const max = Math.max(0, ...q.units.map((u) => u.sortOrder));
      await createBusinessUnit({ name, color: newColor, imageUrl: newImage, sortOrder: max + 10 });
      await refresh();
      setNewName("");
      setNewImage(null);
      message.success(tx("inb_saved_ok"));
    } catch {
      message.error(tx("inb_error"));
    } finally {
      setBusy(false);
    }
  }

  const active = q.units.filter((u) => !u.archived);
  const archived = q.units.filter((u) => u.archived);
  const colorLabel = (c: UnitColor) => tx(`inb_color_${c}`);

  return (
    <div id="settings-units" className="adm-anchor">
      <Panel
        title={
          <span className="fin-panel-title">
            <IconBadge icon={TreeStructure} tone="primary" size={30} />
            <Tooltip title={tx("inb_units_hint")}>
              <span>{tx("inb_units_title")}</span>
            </Tooltip>
          </span>
        }
        extra={active.length ? <span className="bu-count">{active.length}</span> : undefined}
      >
        {q.isLoading ? (
          <LoadingState />
        ) : (
          <div className="bu-wrap">
            {!q.units.length ? <EmptyState title={tx("inb_unit_empty")} description={tx("inb_units_hint")} /> : null}
            {active.length ? (
              <ul className="bu-list">
                {active.map((u) => (
                  <UnitRow key={u.id} unit={u} onPatch={patch} colorLabel={colorLabel} />
                ))}
              </ul>
            ) : null}

            <form
              className="bu-add"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <UnitPhotoButton value={newImage} name={newName.trim() || tx("inb_unit_name_ph")} onChange={setNewImage} />
              <UnitSwatches value={newColor} onChange={setNewColor} label={tx("inb_unit_color")} colorLabel={colorLabel} />
              <Input
                className="bu-add-name"
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={tx("inb_unit_name_ph")}
                aria-label={tx("inb_unit_name_ph")}
                prefix={<i className={`bu-dot is-${UNIT_TONE[newColor]}`} aria-hidden />}
              />
              <Button htmlType="submit" type="primary" icon={<Plus size={16} />} loading={busy} disabled={!newName.trim()}>
                {tx("inb_unit_add")}
              </Button>
            </form>

            {archived.length ? (
              <>
                <p className="bu-archived-title">
                  <Archive size={14} aria-hidden />
                  {tx("inb_unit_archived")}
                </p>
                <ul className="bu-list is-archived">
                  {archived.map((u) => (
                    <UnitRow key={u.id} unit={u} onPatch={patch} colorLabel={colorLabel} />
                  ))}
                </ul>
              </>
            ) : null}
            <PhotoCreditsLink className="bu-credits" />
          </div>
        )}
      </Panel>
    </div>
  );
}

function UnitRow({
  unit,
  onPatch,
  colorLabel,
}: {
  unit: BusinessUnit;
  onPatch: (id: string, p: BusinessUnitInput) => Promise<boolean>;
  colorLabel: (c: UnitColor) => string;
}) {
  const { tx } = useStore();
  const [name, setName] = useState(unit.name);
  const [colorOpen, setColorOpen] = useState(false);
  // Follow a rename that came back from the server (adjust state during render, not in an effect).
  const [seen, setSeen] = useState(unit.name);
  if (seen !== unit.name) {
    setSeen(unit.name);
    setName(unit.name);
  }
  const tone = UNIT_TONE[unit.color ?? "slate"];

  async function rename() {
    const n = name.trim();
    if (!n) {
      setName(unit.name);
      return;
    }
    if (n !== unit.name && !(await onPatch(unit.id, { name: n }))) setName(unit.name);
  }

  return (
    <li className={`bu-row${unit.archived ? " is-archived" : ""}`}>
      <UnitPhotoButton
        value={unit.imageUrl}
        name={unit.name}
        disabled={unit.archived}
        onChange={(img) => {
          if (img !== unit.imageUrl) void onPatch(unit.id, { imageUrl: img });
        }}
      />
      <Popover
        open={colorOpen}
        onOpenChange={setColorOpen}
        trigger="click"
        placement="bottomLeft"
        content={
          <UnitSwatches
            value={unit.color}
            label={tx("inb_unit_color")}
            colorLabel={colorLabel}
            onChange={(c) => {
              setColorOpen(false);
              if (c !== unit.color) void onPatch(unit.id, { color: c });
            }}
          />
        }
      >
        <button type="button" className={`bu-swatch is-${tone}`} aria-label={`${tx("inb_unit_color")}: ${unit.name}`} disabled={unit.archived} />
      </Popover>
      <Input
        variant="borderless"
        className="bu-name"
        value={name}
        maxLength={80}
        disabled={unit.archived}
        aria-label={`${tx("inb_unit_rename")}: ${unit.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void rename()}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setName(unit.name);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
      {unit.archived ? (
        <Tooltip title={tx("inb_unit_restore")}>
          <Button type="text" icon={<ArrowCounterClockwise size={16} />} aria-label={`${tx("inb_unit_restore")}: ${unit.name}`} onClick={() => void onPatch(unit.id, { archived: false })} />
        </Tooltip>
      ) : (
        <Tooltip title={tx("inb_unit_archive")}>
          <Button type="text" icon={<Archive size={16} />} aria-label={`${tx("inb_unit_archive")}: ${unit.name}`} onClick={() => void onPatch(unit.id, { archived: true })} />
        </Tooltip>
      )}
    </li>
  );
}

/** The unit's photo (or an empty frame); click → the built-in gallery + "no photo". */
function UnitPhotoButton({ value, name, disabled, onChange }: { value: string | null; name: string; disabled?: boolean; onChange: (img: string | null) => void }) {
  const { tx } = useStore();
  const [open, setOpen] = useState(false);
  const pick = (img: string | null) => {
    setOpen(false);
    onChange(img);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={
        <div className="bu-gallery" role="radiogroup" aria-label={`${tx("ph_pick")}: ${name}`}>
          {UNIT_IMAGES.map((img) => (
            <button key={img} type="button" role="radio" aria-checked={value === img} className={`bu-gallery-item${value === img ? " is-on" : ""}`} onClick={() => pick(img)}>
              <img src={unitThumb(img)} alt={tx("ph_photo")} width={112} height={72} loading="lazy" decoding="async" />
              {value === img ? (
                <span className="bu-gallery-check" aria-hidden>
                  <Check size={12} weight="bold" />
                </span>
              ) : null}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={!value} className={`bu-gallery-item is-none${!value ? " is-on" : ""}`} onClick={() => pick(null)}>
            <Prohibit size={20} aria-hidden />
            <span>{tx("ph_no_photo")}</span>
          </button>
        </div>
      }
    >
      <button type="button" className={`bu-photo${value ? "" : " is-empty"}`} aria-label={`${tx("ph_change")}: ${name}`} disabled={disabled}>
        {value ? <img src={unitThumb(value)} alt="" width={56} height={40} loading="lazy" decoding="async" /> : <ImageSquare size={18} aria-hidden />}
      </button>
    </Popover>
  );
}
