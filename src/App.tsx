import { Outlet, Route, Routes } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";

import Home from "@/pages/Home";

import DashboardLayout from "@/pages/dashboard/Layout";
import DashboardOverview from "@/pages/dashboard/Overview";
import DashboardSettings from "@/pages/dashboard/Settings";

import DatasetsList from "@/pages/datasets/List";
import DatasetCreate from "@/pages/datasets/Create";
import DatasetById from "@/pages/datasets/Detail";
import DatasetEdit from "@/pages/datasets/Edit";

import DatasetReleaseCreate from "@/pages/datasets/releases/Create";
import DatasetReleaseById from "@/pages/datasets/releases/Detail";
import DatasetReleaseEdit from "@/pages/datasets/releases/Edit";
import DatasetReleaseTransfers from "@/pages/datasets/releases/transfers/List";
import DatasetReleaseTransferCreate from "@/pages/datasets/releases/transfers/Create";

import RecordsetsList from "@/pages/recordsets/List";
import RecordsetCreate from "@/pages/recordsets/Create";
import RecordsetById from "@/pages/recordsets/Detail";
import RecordsetEdit from "@/pages/recordsets/Edit";
import RecordsetReleaseById from "@/pages/recordsets/releases/Detail";
import RecordsetDraftCreate from "@/pages/recordsets/drafts/Create";
import RecordsetDraftById from "@/pages/recordsets/drafts/Detail";
import RecordsetDraftEdit from "@/pages/recordsets/drafts/Edit";
import RecordsetDraftFiles from "@/pages/recordsets/drafts/Files";

import TransfersList from "@/pages/transfers/List";
import TransferById from "@/pages/transfers/Detail";

function RootLayout() {
  return (
    <ToastProvider>
      <Navbar />
      <Outlet />
    </ToastProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Home />} />

        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="settings" element={<DashboardSettings />} />
        </Route>

        <Route path="datasets">
          <Route index element={<DatasetsList />} />
          <Route path="create" element={<DatasetCreate />} />
          <Route path=":dataset_id" element={<DatasetById />} />
          <Route path=":dataset_id/edit" element={<DatasetEdit />} />
          <Route path="releases/create" element={<DatasetReleaseCreate />} />
          <Route path="releases/:release_id" element={<DatasetReleaseById />} />
          <Route path="releases/:release_id/edit" element={<DatasetReleaseEdit />} />
          <Route path="releases/:release_id/transfers" element={<DatasetReleaseTransfers />} />
          <Route path="releases/:release_id/transfers/create" element={<DatasetReleaseTransferCreate />} />
        </Route>

        <Route path="recordsets">
          <Route index element={<RecordsetsList />} />
          <Route path="create" element={<RecordsetCreate />} />
          <Route path=":recordset_id" element={<RecordsetById />} />
          <Route path=":recordset_id/edit" element={<RecordsetEdit />} />
          <Route path="releases/:release_id" element={<RecordsetReleaseById />} />
          <Route path="drafts/create" element={<RecordsetDraftCreate />} />
          <Route path="drafts/:draft_id" element={<RecordsetDraftById />} />
          <Route path="drafts/:draft_id/edit" element={<RecordsetDraftEdit />} />
          <Route path="drafts/:draft_id/files" element={<RecordsetDraftFiles />} />
        </Route>

        <Route path="transfers">
          <Route index element={<TransfersList />} />
          <Route path=":transfer_id" element={<TransferById />} />
        </Route>
      </Route>
    </Routes>
  );
}
