import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPage } from "./pages/Account";
import { AutomationPage } from "./pages/Automation";
import { BoxesPage } from "./pages/Boxes";
import { CalendarPage } from "./pages/Calendar";
import { ContactsPage } from "./pages/Contacts";
import { CustomersPage } from "./pages/Customers";
import { DocsPage } from "./pages/Docs";
import { ExceptionsPage } from "./pages/Exceptions";
import { InboxPage } from "./pages/Inbox";
import { InvoicesPage } from "./pages/Invoices";
import { JobDetailPage } from "./pages/JobDetail";
import { JobsPage } from "./pages/Jobs";
import { LeadsPage } from "./pages/Leads";
import { NotificationsPage } from "./pages/Notifications";
import { OverviewPage } from "./pages/Overview";
import { PipelinePage } from "./pages/Pipeline";
import { QuoteWizardPage } from "./pages/QuoteWizard";
import { QuotationsPage } from "./pages/Quotations";
import { RatesPage } from "./pages/Rates";
import { ReportsPage } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { ShipmentsPage } from "./pages/Shipments";
import { TasksPage } from "./pages/Tasks";
import { VendorBillsPage } from "./pages/VendorBills";
import { VendorsPage } from "./pages/Vendors";
import { YardPage } from "./pages/Yard";
import { homePathFor } from "./shell/nav.ts";
import { useShellSession } from "./shell/session.tsx";

export function AppRoutes() {
  const { shellUser } = useShellSession();

  return (
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
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/automation" element={<AutomationPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to={shellUser ? homePathFor(shellUser.department) : "/"} replace />} />
    </Routes>
  );
}
