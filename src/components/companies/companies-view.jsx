"use client";

import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { Building2, FolderPlus, Plus, Search, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { toast } from "sonner";
import { closeService, deleteCompany, moveCompany, reopenService, saveCompany, setServiceDates } from "@/actions/companies";
import { deleteGroup, saveGroup } from "@/actions/groups";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Page, PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Kbd } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStoredState } from "@/hooks/use-stored-state";
import { formatDate, utcStamp } from "@/lib/dates";
import { addPrice, priceOf, usdtOf } from "@/lib/money";
import { paymentOptions } from "@/lib/options";
import { endFrom, isArchived, matchesStatus, openStates, SERVICES, serviceState } from "@/lib/services";
import { matches, plural } from "@/lib/utils";
import { CompanyDetails } from "./company-details";
import { CompanyForm } from "./company-form";
import { CompanyPanel } from "./company-panel";
import { GroupDialog } from "./group-dialog";
import { GroupSection } from "./group-section";
import { DragCard } from "./service-table";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "renewal", label: "Renewal" },
  { value: "suspended", label: "Suspended" },
  { value: "rebuy", label: "Rebuy" },
  { value: "ended", label: "Ended" },
  { value: "active", label: "Active" },
];

const NONE_COLLAPSED = [];
const DEFAULT_TABS = {};
const NO_HISTORY = [];
const DEFAULT_TAB = "rdp";

function pickTable(tables, key) {
  return (
    tables.find((table) => table.service.key === key && table.rows.length) ??
    tables.find((table) => table.rows.length) ??
    tables.find((table) => table.service.key === key) ??
    tables[0]
  );
}

let tempSequence = 0;
const tempId = () => -(Date.now() * 10 + (tempSequence++ % 10));

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

function companiesReducer(state, action) {
  switch (action.type) {
    case "save":
      return state.some((company) => company.id === action.company.id)
        ? state.map((company) => (company.id === action.company.id ? { ...company, ...action.company } : company))
        : [...state, action.company];
    case "remove":
      return state.filter((company) => company.id !== action.id);
    case "ungroup":
      return state.map((company) => (company.groupId === action.groupId ? { ...company, groupId: null } : company));
    case "group-payment":
      return state.map((company) =>
        company.groupId === action.groupId
          ? { ...company, paymentType: action.paymentType, paymentMethod: action.paymentMethod }
          : company,
      );
    default:
      return state;
  }
}

function groupsReducer(state, action) {
  switch (action.type) {
    case "save": {
      const exists = state.some((group) => group.id === action.group.id);
      const next = exists
        ? state.map((group) => (group.id === action.group.id ? { ...group, ...action.group } : group))
        : [...state, action.group];
      return next.sort(byName);
    }
    case "remove":
      return state.filter((group) => group.id !== action.id);
    default:
      return state;
  }
}

function byEndDate(a, b) {
  if (a.state.days === null || b.state.days === null) {
    return (a.state.days === null) - (b.state.days === null) || byName(a.company, b.company);
  }
  return a.state.days - b.state.days || byName(a.company, b.company);
}

export function CompaniesView({ companies, groups, nameHistory, rules, pricing, today, timezone }) {
  const searchParams = useSearchParams();
  const docked = useMediaQuery("(min-width: 1024px)", true);
  const [items, applyCompanies] = useOptimistic(companies, companiesReducer);
  const [groupList, applyGroups] = useOptimistic(groups, groupsReducer);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(() => {
    const initial = searchParams.get("status");
    return STATUS_FILTERS.some((filter) => filter.value === initial) ? initial : "all";
  });
  const [tabs, setTabs] = useStoredState("life-tracker.tabs", DEFAULT_TABS);
  const [collapsed, setCollapsed] = useStoredState("life-tracker.collapsed", NONE_COLLAPSED);
  const [creating, setCreating] = useState(() => (searchParams.get("new") ? { groupName: "" } : null));
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [dragging, setDragging] = useState(null);
  const searchRef = useRef(null);

  const urlId = Number(searchParams.get("id")) || null;
  const [selectedId, setSelectedId] = useState(urlId);
  const [syncedUrlId, setSyncedUrlId] = useState(urlId);
  if (urlId !== syncedUrlId) {
    setSyncedUrlId(urlId);
    setSelectedId(urlId);
  }

  const [createdIds, setCreatedIds] = useState({});

  const groupName = (id) => groupList.find((group) => group.id === id)?.name ?? null;
  const found =
    items.find((company) => company.id === createdIds[selectedId]) ?? items.find((company) => company.id === selectedId);
  const activeId = found?.id ?? selectedId;
  const selected = found ? { ...found, groupName: groupName(found.groupId) } : null;
  const options = useMemo(() => ({ groups: groupList, ...paymentOptions(items, groupList) }), [items, groupList]);

  const searched = useMemo(
    () =>
      items.filter((company) =>
        matches(query, company.name, company.website, company.digirdpEmail, company.paymentMethod, company.paymentType, company.notes),
      ),
    [items, query],
  );

  const counts = useMemo(() => {
    const result = { renewal: 0, suspended: 0, rebuy: 0, ended: 0, active: 0 };
    for (const company of searched) {
      if (isArchived(company)) continue;
      for (const state of openStates(company, today, rules)) {
        if (state.status === "renewed") result.active += 1;
        else if (state.status in result) result[state.status] += 1;
      }
    }
    return result;
  }, [searched, today, rules]);

  const historyByCompany = useMemo(() => {
    const map = new Map();
    for (const entry of nameHistory) {
      const list = map.get(entry.companyId);
      if (list) list.push(entry);
      else map.set(entry.companyId, [entry]);
    }
    return map;
  }, [nameHistory]);

  const filtering = Boolean(query.trim()) || status !== "all";

  const sections = useMemo(() => {
    const buckets = new Map([...groupList.map((group) => [group.id, []]), [null, []]]);
    for (const company of searched) (buckets.get(company.groupId) ?? buckets.get(null)).push(company);

    const build = (group) => {
      const key = group?.id ?? "none";
      const bucket = buckets.get(group?.id ?? null);
      const members = bucket.filter((company) => !isArchived(company));
      const archived = bucket.reduce(
        (count, company) => count + SERVICES.filter((service) => company[service.closed]).length,
        0,
      );
      const tables = SERVICES.map((service) => {
        const rows = members
          .map((company) => ({ company, state: serviceState(company, service, today, rules) }))
          .filter((row) => row.state.status !== "closed");
        const table = { service, ended: 0, renewal: 0, suspended: 0, rebuy: 0 };
        for (const row of rows) if (row.state.status in table) table[row.state.status] += 1;
        table.rows = rows.filter((row) => matchesStatus(row.state, status)).sort(byEndDate);
        table.cost = table.rows.reduce(
          (cost, row) => {
            const price = priceOf(row.company, service, pricing);
            if (!price) return cost;
            addPrice(cost.totals, price);
            cost.usdt += usdtOf(price, pricing.rates);
            return cost;
          },
          { usdt: 0, totals: {} },
        );
        return table;
      });
      const total = (key) => tables.reduce((sum, table) => sum + table[key], 0);
      return {
        key,
        group,
        members,
        archived,
        tables,
        active: pickTable(tables, tabs[key] ?? DEFAULT_TAB),
        ended: total("ended"),
        renewal: total("renewal"),
        suspended: total("suspended"),
        rebuy: total("rebuy"),
      };
    };

    return [...groupList.map(build), build(null)].filter((section) =>
      section.group && !filtering ? true : section.tables.some((table) => table.rows.length),
    );
  }, [groupList, searched, status, today, filtering, tabs, rules, pricing]);

  const order = useMemo(
    () => [
      ...new Set(
        sections.flatMap((section) => (collapsed.includes(section.key) ? [] : section.active.rows.map((row) => row.company.id))),
      ),
    ],
    [sections, collapsed],
  );

  function select(id) {
    setSelectedId(id);
    if (id < 0) return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", String(id));
    else url.searchParams.delete("id");
    url.searchParams.delete("new");
    url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  }

  function openCompany(id) {
    setCreating(null);
    setEditingId(null);
    setDraft(null);
    select(id);
  }

  function openCreate(group = "") {
    select(null);
    setEditingId(null);
    setDraft(null);
    setCreating({ groupName: group });
  }

  function closePanel() {
    select(null);
    setCreating(null);
    setEditingId(null);
    setDraft(null);
  }

  function toggleSection(key) {
    setCollapsed((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  useEffect(() => {
    const realId = createdIds[selectedId];
    if (!realId || !companies.some((company) => company.id === realId)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("id", String(realId));
    window.history.replaceState(null, "", url);
  }, [companies, createdIds, selectedId]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "n") {
        event.preventDefault();
        openCreate();
      } else if (event.key === "Escape") {
        closePanel();
      } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && activeId && order.length) {
        event.preventDefault();
        const index = order.indexOf(activeId);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = order[Math.min(order.length - 1, Math.max(0, index + step))];
        openCompany(next);
        document.querySelector(`[data-company-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleSave(company, values, parsed) {
    const isNew = !company;
    const { group, ...fields } = parsed;
    const existingGroup = group ? groupList.find((item) => item.name.toLowerCase() === group.toLowerCase()) : null;
    const newGroup =
      group && !existingGroup
        ? { id: tempId(), name: group, paymentType: fields.paymentType, paymentMethod: fields.paymentMethod }
        : null;
    const optimistic = {
      ...(company ?? { id: tempId(), createdAt: null, updatedAt: null }),
      ...fields,
      groupId: existingGroup?.id ?? newGroup?.id ?? null,
    };

    setDraft(null);
    if (isNew) {
      setCreating(null);
      select(optimistic.id);
    } else {
      setEditingId(null);
    }

    startTransition(async () => {
      if (newGroup) applyGroups({ type: "save", group: newGroup });
      applyCompanies({ type: "save", company: optimistic });
      const result = await saveCompany(company?.id ?? null, values);
      if (!result.ok) {
        toast.error(result.error);
        setDraft({ values, errors: result.fieldErrors ?? {} });
        if (isNew) {
          select(null);
          setCreating({ groupName: values.group });
        } else {
          setEditingId(company.id);
        }
        return;
      }
      if (isNew) setCreatedIds((current) => ({ ...current, [optimistic.id]: result.data.id }));
      toast.success(isNew ? `${parsed.name} added` : "Changes saved");
    });
  }

  function handleDelete(company) {
    closePanel();
    startTransition(async () => {
      applyCompanies({ type: "remove", id: company.id });
      const result = await deleteCompany(company.id);
      if (result.ok) toast.success(`${company.name} deleted`);
      else toast.error(result.error);
    });
  }

  function handleMove(company, groupId, undoable = true) {
    const from = company.groupId ?? null;
    if (from === groupId) return;
    const target = groupName(groupId) ?? "No group";

    startTransition(async () => {
      applyCompanies({ type: "save", company: { id: company.id, groupId } });
      const result = await moveCompany(company.id, groupId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${company.name} moved to ${target}`,
        undoable ? { action: { label: "Undo", onClick: () => handleMove({ ...company, groupId }, from, false) } } : undefined,
      );
    });
  }

  function updateDates(company, service, dates, previous) {
    startTransition(async () => {
      applyCompanies({ type: "save", company: { id: company.id, [service.start]: dates.start, [service.end]: dates.end } });
      const result = await setServiceDates(company.id, service.key, dates);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (previous) {
        toast.success(`${service.label} renewed until ${formatDate(dates.end)}`, {
          action: { label: "Undo", onClick: () => updateDates(company, service, previous) },
        });
      }
    });
  }

  function handleRenewToday(company, service) {
    const previous = { start: company[service.start], end: company[service.end] };
    updateDates(company, service, { start: today, end: endFrom(service, today) }, previous);
  }

  function handleCloseService(company, service) {
    startTransition(async () => {
      applyCompanies({ type: "save", company: { id: company.id, [service.closed]: utcStamp() } });
      const result = await closeService(company.id, service.key);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${company.name} ${service.label} moved to the archive`, {
        action: { label: "Undo", onClick: () => handleReopenService(company, service) },
      });
    });
  }

  function handleReopenService(company, service) {
    startTransition(async () => {
      applyCompanies({ type: "save", company: { id: company.id, [service.closed]: null } });
      const result = await reopenService(company.id, service.key);
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleRenew(company, service, start) {
    const previous = { start: company[service.start], end: company[service.end] };
    updateDates(company, service, { start, end: endFrom(service, start) }, previous);
  }

  function handleSaveGroup(group, input) {
    const optimistic = {
      id: group?.id ?? tempId(),
      name: input.name.trim(),
      paymentType: input.paymentType.trim() || null,
      paymentMethod: input.paymentMethod.trim() || null,
    };
    setGroupDialog(null);

    startTransition(async () => {
      applyGroups({ type: "save", group: optimistic });
      if (group && input.applyToCompanies) {
        applyCompanies({
          type: "group-payment",
          groupId: group.id,
          paymentType: optimistic.paymentType,
          paymentMethod: optimistic.paymentMethod,
        });
      }
      const result = await saveGroup(group?.id ?? null, input);
      if (!result.ok) {
        toast.error(result.error);
        setGroupDialog({ group, draft: input, errors: result.fieldErrors ?? {} });
        return;
      }
      toast.success(group ? `${optimistic.name} updated` : `${optimistic.name} created`);
    });
  }

  function handleDeleteGroup(group) {
    setGroupToDelete(null);
    startTransition(async () => {
      applyGroups({ type: "remove", id: group.id });
      applyCompanies({ type: "ungroup", groupId: group.id });
      const result = await deleteGroup(group.id);
      if (result.ok) toast.success(`${group.name} deleted`);
      else toast.error(result.error);
    });
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const memberCount = (group) => (group ? items.filter((company) => company.groupId === group.id).length : 0);
  const panelOpen = Boolean(creating || selected);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Page>
          <PageHeader
            title="Companies"
            description={`${plural(items.length, "company", "companies")} across ${plural(groupList.length, "group")}`}
            actions={
              <>
                <Button variant="secondary" onClick={() => setGroupDialog({ group: null })}>
                  <FolderPlus />
                  <span className="hidden sm:inline">New group</span>
                </Button>
                <Button onClick={() => openCreate()}>
                  <Plus /> New company
                  <Kbd className="bg-ground/15 text-ground/70">N</Kbd>
                </Button>
              </>
            }
          />

          <div className="sticky top-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-2 bg-ground px-4 py-2.5 lg:-mx-8 lg:px-8">
            <label className="relative flex min-w-[22rem] flex-1 items-center sm:max-w-[38rem]">
              <Search className="pointer-events-none absolute left-3 size-[1.4rem] text-ink-3" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search companies, websites, emails"
                aria-label="Search companies"
                className="h-8.5 w-full rounded-lg bg-surface pr-9 pl-9 text-sm shadow-card outline-none placeholder:text-ink-4 focus:shadow-[0_0_0_3px_rgb(140_108_70/0.18),var(--shadow-card)]"
              />
              <Kbd className="absolute right-2.5">/</Kbd>
            </label>
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS.map((filter) => ({ ...filter, count: counts[filter.value] }))}
            />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={({ active }) => setDragging(active.data.current.company)}
            onDragCancel={() => setDragging(null)}
            onDragEnd={({ active, over }) => {
              setDragging(null);
              if (over) handleMove(active.data.current.company, over.data.current.groupId);
            }}
          >
            <div className="mt-2 grid gap-4">
              {sections.map((section) => (
                <GroupSection
                  key={section.key}
                  section={section}
                  collapsed={collapsed.includes(section.key)}
                  dragging={dragging}
                  pricing={pricing}
                  selectedId={activeId}
                  onToggle={() => toggleSection(section.key)}
                  onTab={(key) => setTabs({ ...tabs, [section.key]: key })}
                  onSelect={openCompany}
                  onAdd={() => openCreate(section.group?.name ?? "")}
                  onEdit={() => setGroupDialog({ group: section.group })}
                  onDelete={() => setGroupToDelete(section.group)}
                  onRenewToday={handleRenewToday}
                  onCloseService={handleCloseService}
                />
              ))}
              {!sections.length && (
                <EmptyState
                  filtering={filtering}
                  onCreate={() => openCreate()}
                  onClear={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                />
              )}
            </div>
            <DragOverlay dropAnimation={null}>{dragging && <DragCard company={dragging} />}</DragOverlay>
          </DndContext>
        </Page>
      </div>

      <CompanyPanel open={panelOpen} docked={docked} title={creating ? "New company" : selected?.name} onClose={closePanel}>
        {creating ? (
          <CompanyForm
            key={`new-${Boolean(draft)}`}
            options={options}
            pricing={pricing}
            today={today}
            defaultGroup={creating.groupName}
            draft={draft}
            onCancel={closePanel}
            onSubmit={(values, parsed) => handleSave(null, values, parsed)}
          />
        ) : selected && editingId === selected.id ? (
          <CompanyForm
            key={`edit-${selected.id}-${Boolean(draft)}`}
            company={selected}
            options={options}
            pricing={pricing}
            today={today}
            draft={draft}
            onCancel={() => {
              setEditingId(null);
              setDraft(null);
            }}
            onSubmit={(values, parsed) => handleSave(selected, values, parsed)}
          />
        ) : selected ? (
          <CompanyDetails
            key={selected.id}
            company={selected}
            groups={groupList}
            history={historyByCompany.get(selected.id) ?? NO_HISTORY}
            rules={rules}
            pricing={pricing}
            today={today}
            timezone={timezone}
            onClose={closePanel}
            onEdit={() => setEditingId(selected.id)}
            onDelete={() => handleDelete(selected)}
            onMove={(groupId) => handleMove(selected, groupId)}
            onRenew={(service, start) => handleRenew(selected, service, start)}
            onCloseService={(service) => handleCloseService(selected, service)}
            onReopenService={(service) => handleReopenService(selected, service)}
          />
        ) : null}
      </CompanyPanel>

      <GroupDialog
        state={groupDialog}
        options={options}
        memberCount={memberCount(groupDialog?.group)}
        onClose={() => setGroupDialog(null)}
        onSubmit={handleSaveGroup}
      />

      <ConfirmDialog
        open={Boolean(groupToDelete)}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
        title={`Delete ${groupToDelete?.name ?? "group"}?`}
        description={`Its ${plural(memberCount(groupToDelete), "company", "companies")} will move to No group. Nothing else is deleted.`}
        confirmLabel="Delete group"
        onConfirm={() => handleDeleteGroup(groupToDelete)}
      />
    </div>
  );
}

function EmptyState({ filtering, onCreate, onClear }) {
  const Icon = filtering ? SearchX : Building2;
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface px-6 py-16 text-center shadow-card animate-rise">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-sunken text-ink-3">
        <Icon className="size-[2rem]" strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-base font-semibold">{filtering ? "Nothing matches" : "No companies yet"}</p>
      <p className="mt-1 max-w-[38rem] text-sm text-ink-3">
        {filtering
          ? "Try another search or clear the filters to see everything again."
          : "Add your first company to start tracking its domain, hosting and RDP renewals."}
      </p>
      {filtering ? (
        <Button variant="soft" className="mt-5" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Button className="mt-5" onClick={onCreate}>
          <Plus /> Add company
        </Button>
      )}
    </div>
  );
}
