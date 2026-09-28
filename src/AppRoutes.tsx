import { Suspense, lazy, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState } from "./v2/components/LoadingState.tsx";
import { homePathFor } from "./shell/nav.ts";
import { useShellSession } from "./shell/session.tsx";

/** Route-level code splitting: each page loads as its own chunk on first visit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const AccountPage = lazyPage(() => import("./pages/Account"), "AccountPage");
const AutomationPage = lazyPage(() => import("./pages/Automation"), "AutomationPage");
const BoxesPage = lazyPage(() => import("./pages/Boxes"), "BoxesPage");
const CalendarPage = lazyPage(() => import("./pages/Calendar"), "CalendarPage");
const ContactsPage = lazyPage(() => import("./pages/Contacts"), "ContactsPage");
const CustomersPage = lazyPage(() => import("./pages/Customers"), "CustomersPage");
const DocsPage = lazyPage(() => import("./pages/Docs"), "DocsPage");
const DocumentTemplatesPageV2 = lazyPage(() => import("./v2/pages/DocumentTemplatesPage.tsx"), "DocumentTemplatesPageV2");
const ExceptionsPage = lazyPage(() => import("./pages/Exceptions"), "ExceptionsPage");
const InboxPage = lazyPage(() => import("./pages/Inbox"), "InboxPage");
const InvoicesPage = lazyPage(() => import("./pages/Invoices"), "InvoicesPage");
const JobDetailPage = lazyPage(() => import("./pages/JobDetail"), "JobDetailPage");
const JobsPage = lazyPage(() => import("./pages/Jobs"), "JobsPage");
const LeadsPage = lazyPage(() => import("./pages/Leads"), "LeadsPage");
const NotificationsPage = lazyPage(() => import("./pages/Notifications"), "NotificationsPage");
const OverviewPage = lazyPage(() => import("./pages/Overview"), "OverviewPage");
const PipelinePage = lazyPage(() => import("./pages/Pipeline"), "PipelinePage");
const QuoteWizardPage = lazyPage(() => import("./pages/QuoteWizard"), "QuoteWizardPage");
const QuotationsPage = lazyPage(() => import("./pages/Quotations"), "QuotationsPage");
const RatesPage = lazyPage(() => import("./pages/Rates"), "RatesPage");
const ReportsPage = lazyPage(() => import("./pages/Reports"), "ReportsPage");
const SettingsPage = lazyPage(() => import("./pages/Settings"), "SettingsPage");
const ShipmentsPage = lazyPage(() => import("./pages/Shipments"), "ShipmentsPage");
const TasksPage = lazyPage(() => import("./pages/Tasks"), "TasksPage");
const VendorBillsPage = lazyPage(() => import("./pages/VendorBills"), "VendorBillsPage");
const VendorsPage = lazyPage(() => import("./pages/Vendors"), "VendorsPage");
const YardPage = lazyPage(() => import("./pages/Yard"), "YardPage");
const ImportPage = lazyPage(() => import("./v2/pages/ImportPage.tsx"), "ImportPage");

export function AppRoutes() {
  const { shellUser } = useShellSession();

  return (
    <Suspense fallback={<LoadingState />}>
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/exceptions" element={<ExceptionsPage />} />
      <Route path="/pipeline" element={<PipelinePage />} />
      <Route path="/leads" element={<LeadsPage />} />
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/customers/:id" element={<AccountPage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/rates" element={<RatesPage />} />
      <Route path="/quotations" element={<QuotationsPage />} />
      <Route path="/quotations/new" element={<QuoteWizardPage />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/jobs/:id" element={<JobDetailPage />} />
      <Route path="/invoices" element={<InvoicesPage />} />
      <Route path="/vendors" element={<VendorsPage />} />
      <Route path="/vendor-bills" element={<VendorBillsPage />} />
      <Route path="/boxes" element={<BoxesPage />} />
      <Route path="/shipments" element={<ShipmentsPage />} />
      <Route path="/yard" element={<YardPage />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/docs/templates" element={<DocumentTemplatesPageV2 />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/automation" element={<AutomationPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route path="*" element={<Navigate to={shellUser ? homePathFor(shellUser.department) : "/"} replace />} />
    </Routes>
    </Suspense>
  );
}
