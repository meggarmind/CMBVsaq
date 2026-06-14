import { createBrowserRouter } from "react-router-dom"
import Layout from "@/pages/_layout"
import HomePage from "@/pages/home"
import NotFoundPage from "@/pages/not-found"
import DashboardPage from "@/pages/dashboard"
import VendorsPage from "@/pages/vendors/index"
import VendorDetailPage from "@/pages/vendors/detail"
import AssessmentsPage from "@/pages/assessments/index"
import AssessmentDetailPage from "@/pages/assessments/detail"
import SettingsPage from "@/pages/settings"
import VendorFormPage from "@/pages/vendor-form"
import AccessDeniedPage from "@/pages/access-denied"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "vendors", element: <VendorsPage /> },
      { path: "vendors/:id", element: <VendorDetailPage /> },
      { path: "assessments", element: <AssessmentsPage /> },
      { path: "assessments/:id", element: <AssessmentDetailPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  {
    // Vendor questionnaire — no app nav, no Microsoft login required
    path: "/vendor-form",
    element: <VendorFormPage />,
    errorElement: <NotFoundPage />,
  },
  {
    // Shown when authenticated user has no cr871_appusers record
    path: "/access-denied",
    element: <AccessDeniedPage />,
  },
], {
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})
