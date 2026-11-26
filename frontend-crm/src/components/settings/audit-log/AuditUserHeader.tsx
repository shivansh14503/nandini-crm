"use client";

import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { secondaryButtonSx } from "@/components/settings/form-customization/builderUi";
import type { AuditUserActivity } from "@/services/auditAdmin.service";
import { CATEGORY_TABS, type CategoryTab } from "./auditLogFilter";
import { UserAvatar, UserBadges, relativeTime } from "./auditLogUi";
import { fmtCount } from "@/utils/formats";

/** A count in the company number grouping (Indian until it is changed). */
const count = (value: number) => fmtCount(value);

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Box
        component="span"
        sx={{ color: "var(--mui-palette-text-muted)", whiteSpace: "nowrap" }}
      >
        {label}
      </Box>
      <Box
        component="span"
        sx={{ color: "var(--crm-slate-900)", fontWeight: 600, minWidth: 0 }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * Top of one user's activity log (Users tab): back to everyone, who the user is, when they were last active and
 * signed in, and the category choice with their entries in the period. `user` is undefined while the users load, or
 * when the period holds nothing for a username that is no longer in the user list (counts are then 0).
 */
export function AuditUserHeader({
  username,
  user,
  loading,
  error,
  periodLabel,
  category,
  onCategory,
  onBack,
}: {
  username: string;
  user: AuditUserActivity | undefined;
  loading: boolean;
  error: string | null;
  periodLabel: string;
  category: CategoryTab;
  onCategory: (category: CategoryTab) => void;
  onBack: () => void;
}) {
  const name = user?.name ?? username;
  const meta = user
    ? [
        user.status === "system" ? null : user.username,
        user.role,
        user.department,
        user.email,
      ]
        .filter(Boolean)
        .join(" · ")
    : username;
  // Loaded but not listed: a former user with no entries in this period.
  const fallback = loading || error ? undefined : 0;
  const counts: Record<CategoryTab, number | undefined> = {
    all: user?.total ?? fallback,
    DATA: user?.data ?? fallback,
    CONFIG: user?.config ?? fallback,
    SECURITY: user?.security ?? fallback,
  };

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1.25, minWidth: 0 }}
    >
      <Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ArrowBackRoundedIcon />}
          onClick={onBack}
          sx={{
            ...secondaryButtonSx,
            height: 32,
            backgroundColor: "var(--mui-palette-background-paper)",
          }}
        >
          All users
        </Button>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          minWidth: 0,
        }}
      >
        <UserAvatar
          user={{ name, status: user?.status ?? "unknown", photoUrl: user?.photoUrl }}
          size={44}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flexWrap: "wrap",
            }}
          >
            <Typography
              component="h2"
              sx={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--crm-slate-900)",
                wordBreak: "break-word",
              }}
            >
              {name}
            </Typography>
            {user && <UserBadges user={user} />}
          </Box>
          <Typography
            sx={{
              fontSize: "0.78rem",
              color: "var(--mui-palette-text-secondary)",
              wordBreak: "break-word",
            }}
          >
            {meta}
          </Typography>
          {user ? (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                columnGap: 2,
                rowGap: 0.25,
                mt: 0.5,
                fontSize: "0.78rem",
              }}
            >
              <Fact label="Last active">
                {user.lastActivityAt ? (
                  <Tooltip title={user.lastActivity ?? ""}>
                    <span>
                      {relativeTime(user.lastActivityAt)}
                      {user.lastActivityLabel
                        ? ` (${user.lastActivityLabel})`
                        : ""}
                    </span>
                  </Tooltip>
                ) : (
                  "No entries"
                )}
              </Fact>
              {user.status !== "system" && (
                <Fact label="Last sign-in">{user.lastLogin ?? "Never"}</Fact>
              )}
              {user.status !== "system" && (
                <Fact label="Sign-ins">
                  {count(user.signIns)}
                  {user.failedSignIns > 0 && (
                    <Box
                      component="span"
                      sx={{ color: "var(--crm-amber-700)", fontWeight: 700 }}
                    >
                      {" "}
                      · {count(user.failedSignIns)} failed
                    </Box>
                  )}
                </Fact>
              )}
            </Box>
          ) : loading ? (
            <Skeleton width={260} height={20} sx={{ maxWidth: "100%" }} />
          ) : error ? (
            <Alert
              severity="error"
              sx={{ mt: 0.75, py: 0, fontSize: "0.78rem" }}
            >
              {error}
            </Alert>
          ) : (
            <Typography
              sx={{
                fontSize: "0.78rem",
                color: "var(--mui-palette-text-muted)",
                mt: 0.5,
              }}
            >
              Not in the user list; no entries in this period.
            </Typography>
          )}
        </Box>
      </Box>

      {/* The categories of this user's entries; counts follow the period, the list below also follows the search and filter. */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        <Box role="tablist" aria-label="Category" sx={{ display: "contents" }}>
          {CATEGORY_TABS.map((tab) => {
            const active = tab.key === category;
            const value = counts[tab.key];
            return (
              <ButtonBase
                key={tab.key}
                role="tab"
                aria-selected={active}
                onClick={() => onCategory(tab.key)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,
                  minHeight: 32,
                  px: 1.25,
                  borderRadius: "9999px",
                  fontSize: "0.78rem",
                  fontWeight: active ? 700 : 600,
                  transition: "all 0.15s ease",
                  border: `1px solid ${active ? "var(--mui-palette-primary-softBorder)" : "var(--mui-palette-border-main)"}`,
                  backgroundColor: active
                    ? "var(--mui-palette-primary-soft)"
                    : "var(--mui-palette-background-paper)",
                  color: active
                    ? "var(--crm-text-blue-900)"
                    : "var(--crm-slate-700)",
                  "&:hover": {
                    borderColor: "var(--crm-blue-300)",
                    backgroundColor: "var(--mui-palette-primary-soft)",
                    color: "var(--crm-text-blue-700)",
                  },
                  "&.Mui-focusVisible": {
                    boxShadow: "0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)",
                  },
                }}
              >
                {tab.key === "all" ? "All" : tab.label}
                <Box
                  component="span"
                  sx={{
                    px: 0.75,
                    borderRadius: "9999px",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    lineHeight: 1.6,
                    color: active
                      ? "var(--crm-text-blue-600)"
                      : "var(--mui-palette-text-secondary)",
                    backgroundColor: active
                      ? "var(--mui-palette-background-paper)"
                      : "var(--mui-palette-background-subtle)",
                    border: "1px solid var(--mui-palette-border-main)",
                  }}
                >
                  {value === undefined ? "…" : count(value)}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
        <Typography
          sx={{ fontSize: "0.72rem", color: "var(--mui-palette-text-muted)" }}
        >
          Counts and sign-ins: {periodLabel}
        </Typography>
      </Box>
    </Box>
  );
}
