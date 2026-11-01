
import Icon from "./lib/icons";
import React from "react";
import { A, AuthProvider, UIProvider, useAuth, usePath } from "./lib/store";

import Shell from "./components/Shell";
import Login from "./pages/Login";
import Waiter from "./pages/Waiter";
import WaiterLogin from "./pages/WaiterLogin";
import Waiters from "./pages/Waiters";
import Pos from "./pages/Pos";
import Orders from "./pages/Orders";
import OnlineOrders from "./pages/OnlineOrders";
import Tables from "./pages/Tables";
import MenuItems from "./pages/MenuItems";
import Categories from "./pages/Categories";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import Taxes from "./pages/Taxes";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import CustomerOrder from "./pages/CustomerOrder";

// Public POS is no longer the home page.
// POS is available after login at /admin/pos.
const PUBLIC = {
  "/pos": [Pos, "pos"],
  "/orders": [Orders, "orders"],
  "/online": [OnlineOrders, "pos"],
  "/tables": [Tables, "tables"],
  "/menu": [MenuItems, "menu"],
  "/customers": [Customers, "customers"],
  "/reports": [Reports, "reports"]
};

const ADMIN = {
  "/admin-dashboard": [Dashboard, "reports"],
  "/admin/pos": [Pos, "pos"],
  "/admin/orders": [Orders, "orders"],
  "/admin/online": [OnlineOrders, "pos"],
  "/admin/tables": [Tables, "tables"],
  "/admin/categories": [Categories, "menu"],
  "/admin/customers": [Customers, "customers"],
  "/admin/expenses": [Expenses, "expenses"],
  "/admin/taxes": [Taxes, "taxes"],
  "/admin/users": [Users, "staff"],
  "/admin/waiters": [Waiters, "staff"],
  "/admin/audit": [Audit, "audit"],
  "/admin/notifications": [Notifications, "notifications"],
  "/admin/settings": [Settings, "settings"]
};

function Denied({ admin }) {
  return (
    <div className="page">
      <div className="card">
        <div className="card-b empty">
          <div>
            <Icon n="lock" />
          </div>

          <p>You do not have permission to open this page.</p>

          {!admin && (
            <A to="/admin-login" className="btn pri">
              Sign in as staff
            </A>
          )}
        </div>
      </div>
    </div>
  );
}

function Router() {
  const path = usePath();

  const {
    loading,
    error,
    user,
    can,
    refresh
  } = useAuth();

  // QR customer ordering remains accessible without staff login.
  const qrMatch = path.match(
    /^\/customer-order\/([a-f0-9-]{36})$/i
  );

  if (qrMatch) {
    return <CustomerOrder token={qrMatch[1]} />;
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="spin" />
        <p>Loading Brew &amp; Bite…</p>
      </div>
    );
  }

  // Root URL always opens the login page.
  // Login component redirects already-authenticated users.
  if (path === "/" || path === "/admin-login") {
    return <Login />;
  }

  // Waiter login page.
  if (path === "/waiter-login") {
    return <WaiterLogin />;
  }

  // All other pages require an authenticated user.
  if (!user) {
    return <Login />;
  }

  // Waiter panel.
  if (path === "/waiter") {
    if (user.role === "waiter" || can("waiter")) {
      return <Waiter />;
    }

    return <Denied admin={false} />;
  }

  const admin = path.startsWith("/admin");
  const entry = (admin ? ADMIN : PUBLIC)[path];

  if (!entry) {
    return (
      <Shell admin={admin}>
        <div className="page">
          <div className="card">
            <div className="card-b empty">
              <div>
                <Icon n="compass" />
              </div>

              <p>Page not found.</p>

              <A
                to={
                  admin
                    ? "/admin-dashboard"
                    : "/admin/pos"
                }
                className="btn pri"
              >
                Go home
              </A>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const [Page, perm] = entry;

  return (
    <Shell admin={admin}>
      {can(perm) ? (
        <Page key={path} />
      ) : (
        <Denied admin={admin} />
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </UIProvider>
  );
}
