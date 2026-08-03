import { useEffect, useState, type ReactNode } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { CurrentUserContext, type CurrentUser } from "@/lib/useCurrentUser";

import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";

import DashboardLayout from "@/pages/dashboard/Layout";
import DashboardOverview from "@/pages/dashboard/Overview";
import DashboardSettings from "@/pages/dashboard/Settings";

import DatasetsList from "@/pages/datasets/List";
import DatasetCreate from "@/pages/datasets/Create";
import DatasetById from "@/pages/datasets/Detail";
import DatasetEdit from "@/pages/datasets/Edit";
import CycleLayout from "@/pages/datasets/cycle/CycleLayout";
import SetupStage from "@/pages/datasets/cycle/SetupStage";
import AssembleStage from "@/pages/datasets/cycle/AssembleStage";
import VerifyStage from "@/pages/datasets/cycle/VerifyStage";
import BundleStage from "@/pages/datasets/cycle/BundleStage";
import TransferStage from "@/pages/datasets/cycle/TransferStage";
import DisseminateStage from "@/pages/datasets/cycle/DisseminateStage";

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

import QcReviewDetail from "@/pages/qc/ReviewDetail";
import QcQueue from "@/pages/qc/Queue";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

type AuthStatus = "loading" | "authed" | "unauthed" | "error";

function AuthNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="page-shell content-width">
      <div
        className="mx-auto mt-16 max-w-md rounded-lg p-6 text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {children}
        </div>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  );
}

function RootLayout() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    fetch("/papi/auth/users/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          setCurrentUser((await res.json()) as CurrentUser);
          setAuthStatus("authed");
        } else if (res.status === 401) {
          setAuthStatus("unauthed");
        } else {
          setAuthStatus("error");
        }
      })
      .catch(() => setAuthStatus("error"));
  }, []);

  return (
    <CurrentUserContext.Provider value={currentUser}>
      <ToastProvider>
        <ScrollToTop />
        <Navbar />
        {authStatus === "unauthed" ? (
          <AuthNotice title="You're not logged into Posda">
            Your session has expired or you haven't signed in. Log into Posda,
            then reload this page.
          </AuthNotice>
        ) : authStatus === "error" ? (
          <AuthNotice title="Can't reach the Posda API">
            The API didn't respond. Check that it's running, then reload.
          </AuthNotice>
        ) : (
          <Outlet />
        )}
      </ToastProvider>
    </CurrentUserContext.Provider>
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
          <Route path=":dataset_id/cycle" element={<CycleLayout />}>
            <Route path="setup" element={<SetupStage />} />
            <Route path="assemble" element={<AssembleStage />} />
            <Route path="verify" element={<VerifyStage />} />
            <Route path="bundle" element={<BundleStage />} />
            <Route path="transfer" element={<TransferStage />} />
            <Route path="disseminate" element={<DisseminateStage />} />
          </Route>
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

        <Route path="qc">
          <Route path="queue" element={<QcQueue />} />
          <Route path="reviews/:review_id" element={<QcReviewDetail />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
