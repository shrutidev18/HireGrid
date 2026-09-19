import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { useApplicationsList } from '../hooks/useApplications';
import { useResumesList } from '../hooks/useResumes';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getApiErrorMessage } from '../api/client';
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  STATUS_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type ApplicationListItem,
  type ApplicationListQuery,
  type ApplicationSortField,
  type ApplicationStatus,
  type EmploymentType,
  type WorkMode,
} from '../types/api';
import { formatDate, formatRelative } from '../utils/format';

/**
 * Colour per stage, so the table can be scanned without reading every label.
 * Rejected is the only one that is visually distinct rather than a shade of
 * progress.
 */
const statusStyles: Record<ApplicationStatus, string> = {
  SAVED: 'bg-slate-100 text-slate-600 ring-slate-200',
  APPLIED: 'bg-blue-50 text-blue-700 ring-blue-200',
  ONLINE_ASSESSMENT: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  TECH_INTERVIEW: 'bg-violet-50 text-violet-700 ring-violet-200',
  HR_INTERVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
  OFFER: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

const SEARCH_DEBOUNCE_MS = 400;

/** The view the page opens on: most recently touched first. */
const INITIAL_QUERY: ApplicationListQuery = {
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 20,
};

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const columnHelper = createColumnHelper<ApplicationListItem>();

export default function Applications() {
  const navigate = useNavigate();

  /**
   * Two pieces of search state, on purpose.
   *
   * `searchInput` is what the user sees and must update on every keystroke, or
   * the box feels broken. `debouncedSearch` is what the server is asked about,
   * 400ms after typing stops. Binding the input directly to the debounced
   * value would make the cursor lag behind the keyboard.
   */
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const [query, setQuery] = useState<ApplicationListQuery>(INITIAL_QUERY);

  /**
   * Any change to a filter or the sort returns to page 1.
   *
   * Without this, filtering while on page 3 asks for page 3 of a result set
   * that may now have one page, and the user gets an empty table for a filter
   * that plainly has matches. Every path that narrows or reorders the results
   * goes through here, so the rule cannot be forgotten at one call site.
   */
  const updateQuery = (patch: Partial<ApplicationListQuery>) => {
    setQuery((current) => ({ ...current, ...patch, page: 1 }));
  };

  /**
   * The value actually sent. The debounced search is merged in here rather
   * than stored in `query`, so typing does not have to write to the same state
   * the filters use — and because this object is the React Query key, a change
   * to the debounced value is exactly what triggers the refetch.
   */
  const activeQuery: ApplicationListQuery = useMemo(
    () => ({ ...query, search: debouncedSearch.trim() || undefined }),
    [query, debouncedSearch],
  );

  const { data, isPending, isError, error, isFetching } = useApplicationsList(activeQuery);
  const { data: resumes } = useResumesList();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / activeQuery.pageSize));

  /**
   * Clicking a sortable header cycles: sort by it descending, then ascending,
   * then descending again. Switching to a different column starts descending,
   * because for both dates and recency "newest first" is the useful default.
   */
  const toggleSort = (field: ApplicationSortField) => {
    updateQuery({
      sortBy: field,
      sortOrder: query.sortBy === field && query.sortOrder === 'desc' ? 'asc' : 'desc',
    });
  };

  const sortIndicator = (field: ApplicationSortField) =>
    query.sortBy === field ? (query.sortOrder === 'asc' ? '▲' : '▼') : '';

  /**
   * A sortable header is a real `<button>` inside the `<th>`, not a click
   * handler on the cell. That is what makes it reachable by keyboard and
   * announced as pressable by a screen reader; `aria-sort` on the header tells
   * assistive technology which column is ordering the table and in which
   * direction.
   */
  const sortableHeader = (label: string, field: ApplicationSortField) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      /*
       * `uppercase` is repeated here rather than left to the `<th>`. A button
       * does not inherit `text-transform` through Tailwind's preflight, so the
       * two sortable headers rendered in sentence case while the four plain
       * ones were uppercase — a mismatch that reads as a rendering glitch.
       */
      className="group inline-flex items-center gap-1.5 uppercase tracking-wide font-medium text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      {label}
      <span className="text-[10px] text-slate-400 group-hover:text-slate-600">
        {sortIndicator(field) || '↕'}
      </span>
    </button>
  );

  /**
   * Columns are memoised because TanStack Table treats the array as a
   * dependency. Rebuilt on every render, it would rebuild the table's internal
   * model on every render too.
   */
  const columns = useMemo(
    () => [
      columnHelper.accessor('companyName', {
        header: () => sortableHeader('Company', 'companyName'),
        cell: (info) => (
          <span className="font-medium text-slate-900">{info.getValue()}</span>
        ),
      }),

      columnHelper.accessor('jobTitle', {
        header: () => <span className="font-medium text-slate-600">Role</span>,
        cell: (info) => (
          <div>
            <div className="text-slate-900">{info.getValue()}</div>
            <div className="text-xs text-slate-500">{info.row.original.jobLocation}</div>
          </div>
        ),
      }),

      columnHelper.accessor('status', {
        header: () => <span className="font-medium text-slate-600">Status</span>,
        cell: (info) => (
          <span
            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusStyles[info.getValue()]}`}
          >
            {STATUS_LABELS[info.getValue()]}
          </span>
        ),
      }),

      columnHelper.accessor('dateApplied', {
        header: () => sortableHeader('Applied', 'dateApplied'),
        cell: (info) => {
          const value = info.getValue();
          return value ? (
            <span className="whitespace-nowrap text-slate-600">{formatDate(value)}</span>
          ) : (
            <span className="text-slate-400">—</span>
          );
        },
      }),

      columnHelper.accessor((row) => row.resume?.fileName ?? null, {
        id: 'resume',
        header: () => <span className="font-medium text-slate-600">Resume</span>,
        cell: (info) =>
          info.getValue() ? (
            <span className="block max-w-[14rem] truncate text-slate-600">
              {info.getValue()}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      }),

      columnHelper.accessor('updatedAt', {
        header: () => <span className="font-medium text-slate-600">Last updated</span>,
        cell: (info) => (
          <span className="whitespace-nowrap text-slate-500">
            {formatRelative(info.getValue())}
          </span>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.sortBy, query.sortOrder],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),

    /**
     * The server does the sorting and the paging, so the table is told not to.
     * Left on, TanStack would re-sort and re-slice the twenty rows it was
     * given — sorting one page of results among themselves, which looks like
     * sorting and is not. `manual*` means "the data arrives already correct".
     */
    manualSorting: true,
    manualPagination: true,
    pageCount,
  });

  const hasActiveFilters = Boolean(
    activeQuery.search ||
      query.status ||
      query.employmentType ||
      query.workMode ||
      query.resumeId ||
      query.dateFrom ||
      query.dateTo,
  );

  const clearFilters = () => {
    setSearchInput('');
    setQuery(INITIAL_QUERY);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Applications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total === 1 ? '1 application' : `${total} applications`}
            {hasActiveFilters && ' matching your filters'}
          </p>
        </div>

        <Link
          to="/applications/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Add application
        </Link>
      </div>

      {/* Search + filters */}
      <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[16rem]">
            <span className="sr-only">Search applications</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search company, role or location…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by status"
            value={query.status ?? ''}
            onChange={(event) =>
              updateQuery({ status: (event.target.value || undefined) as ApplicationStatus })
            }
            className={selectClass}
          >
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by employment type"
            value={query.employmentType ?? ''}
            onChange={(event) =>
              updateQuery({
                employmentType: (event.target.value || undefined) as EmploymentType,
              })
            }
            className={selectClass}
          >
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by work mode"
            value={query.workMode ?? ''}
            onChange={(event) =>
              updateQuery({ workMode: (event.target.value || undefined) as WorkMode })
            }
            className={selectClass}
          >
            <option value="">All work modes</option>
            {WORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {WORK_MODE_LABELS[mode]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by resume used"
            value={query.resumeId ?? ''}
            onChange={(event) => updateQuery({ resumeId: event.target.value || undefined })}
            className={selectClass}
          >
            <option value="">All resumes</option>
            {(resumes ?? []).map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.fileName}
              </option>
            ))}
          </select>

          {/*
            Two native date inputs rather than a calendar component. The
            project has no date library and adding one for a range whose whole
            job is to produce two YYYY-MM-DD strings would be a dependency for
            nothing — `<input type="date">` already gives a real date picker,
            keyboard entry and locale-aware display for free.
          */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Applied from
              <input
                type="date"
                value={query.dateFrom ?? ''}
                max={query.dateTo || undefined}
                onChange={(event) => updateQuery({ dateFrom: event.target.value || undefined })}
                className={selectClass}
              />
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              to
              <input
                type="date"
                value={query.dateTo ?? ''}
                min={query.dateFrom || undefined}
                onChange={(event) => updateQuery({ dateTo: event.target.value || undefined })}
                className={selectClass}
              />
            </label>
          </div>
        </div>
      </div>

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {getApiErrorMessage(error, 'Could not load your applications.')}
        </div>
      )}

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {!isPending && !isError && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-sm font-medium text-slate-900">No matching applications</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Nothing matches this combination of search and filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">No applications yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Add the first job you are tracking. You can save one you have not applied to
                yet.
              </p>
              <Link
                to="/applications/new"
                className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Add application
              </Link>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div
          className={`overflow-hidden rounded-2xl border border-slate-200 bg-white transition-opacity ${
            isFetching ? 'opacity-60' : 'opacity-100'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isSorted =
                        header.column.id === query.sortBy ||
                        (header.column.id === 'dateApplied' && query.sortBy === 'dateApplied');

                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            isSorted
                              ? query.sortOrder === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="px-4 py-3 text-xs uppercase tracking-wide"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody className="divide-y divide-slate-100">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/applications/${row.original.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/applications/${row.original.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${row.original.jobTitle} at ${row.original.companyName}`}
                    className="cursor-pointer transition-colors hover:bg-brand-50/40 focus:outline-none focus-visible:bg-brand-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">
              Showing{' '}
              <span className="font-medium text-slate-700">
                {(activeQuery.page - 1) * activeQuery.pageSize + 1}–
                {Math.min(activeQuery.page * activeQuery.pageSize, total)}
              </span>{' '}
              of <span className="font-medium text-slate-700">{total}</span>
            </p>

            <div className="flex items-center gap-2">
              <select
                aria-label="Rows per page"
                value={activeQuery.pageSize}
                onChange={(event) => updateQuery({ pageSize: Number(event.target.value) })}
                className={selectClass}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
                disabled={activeQuery.page <= 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="px-1 text-slate-500">
                Page {activeQuery.page} of {pageCount}
              </span>

              <button
                type="button"
                onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
                disabled={activeQuery.page >= pageCount}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
