"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Construction, Folder, Wrench } from "lucide-react";
import {
  togglePageMaintenance,
  type MenuAccessMatrixRow,
} from "@/app/actions/settings";
import { MAINTENANCE_PAGES } from "@/lib/config/maintenance-pages";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import MenuAccessControl from "@/components/settings/MenuAccessControl";

export default function SettingsClient({
  enabledKeys: initialEnabledKeys,
  canManage,
  accessMatrix: initialAccessMatrix,
  usersDirectory,
  initialTab,
}: {
  enabledKeys: string[];
  canManage: boolean;
  accessMatrix: MenuAccessMatrixRow[];
  usersDirectory: ReactNode;
  initialTab: "menu-access" | "maintenance" | "users";
}) {
  const router = useRouter();
  const [enabledKeys, setEnabledKeys] = useState(initialEnabledKeys);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  const groups = useMemo(() => {
    const grouped = new Map<string, typeof MAINTENANCE_PAGES>();
    for (const page of MAINTENANCE_PAGES) {
      const current = grouped.get(page.section) ?? [];
      grouped.set(page.section, [...current, page]);
    }
    return [...grouped.entries()];
  }, []);

  const toggleMaintenance = (pageKey: string, enabled: boolean) => {
    const previousKeys = enabledKeys;
    setEnabledKeys((current) =>
      enabled
        ? [...new Set([...current, pageKey])]
        : current.filter((key) => key !== pageKey),
    );
    setPendingKey(pageKey);
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await togglePageMaintenance(pageKey, enabled);
        if (!result.success) {
          setEnabledKeys(previousKeys);
          setMessage({ type: "error", text: result.message });
          return;
        }

        setMessage({ type: "success", text: result.message });
        router.refresh();
      } catch (error) {
        console.error("Updating page maintenance failed:", error);
        setEnabledKeys(previousKeys);
        setMessage({
          type: "error",
          text: "Gagal menyimpan status maintenance halaman.",
        });
      } finally {
        setPendingKey(null);
      }
    });
  };

  const toggleGroup = (section: string) => {
    setCollapsedGroups((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };

  return (
    <section className="rounded-[14px] border border-border bg-card p-4 text-card-foreground md:p-5">
      <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-secondary">
            <Wrench className="size-4" />
            Pengaturan
          </div>
          <h1 className="text-[28px] font-black tracking-[-0.04em] text-foreground">
            Pengaturan Sistem
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Kelola hak akses menu, pengguna, dan preferensi aplikasi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-lightsecondary px-3 py-1.5 text-xs font-bold text-secondary">
            <Construction className="size-4" />
            {enabledKeys.length} maintenance
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
            {initialAccessMatrix.length} menu terdaftar
          </span>
        </div>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="mb-5 h-auto flex-wrap justify-start gap-1 border border-border bg-muted p-1">
          <TabsTrigger value="menu-access">Hak Akses Menu</TabsTrigger>
          {usersDirectory && (
            <TabsTrigger value="users">Manajemen Pengguna</TabsTrigger>
          )}
          <TabsTrigger value="maintenance">Status Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-0">
          <p className="mb-4 text-xs text-muted-foreground">
            Pengaturan Sistem selalu tersedia untuk memulihkan halaman.
          </p>
          {message && (
            <p
              role={message.type === "error" ? "alert" : "status"}
              className={[
                "mb-4 rounded-lg border px-4 py-3 text-sm font-medium",
                message.type === "error"
                  ? "border-error/30 bg-lighterror text-error"
                  : "border-success/30 bg-lightsuccess text-success",
              ].join(" ")}
            >
              {message.text}
            </p>
          )}

          {!canManage && (
            <p className="mb-4 rounded-lg border border-warning/30 bg-lightwarning px-4 py-3 text-sm text-warning">
              Anda dapat melihat status, tetapi hanya Direktur, Wakil Direktur,
              atau Administrasi yang dapat mengubah pengaturan.
            </p>
          )}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted px-5 py-3 text-[15px] font-black uppercase tracking-[0.12em] text-card-foreground">
            Kontrol Navigasi &amp; Maintenance
          </div>

          <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-border bg-muted/70 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:grid">
            <div className="px-4 py-3">Halaman / Sub-Menu</div>
            <div className="px-4 py-3">Alamat Halaman</div>
            <div className="px-4 py-3 text-right">Maintenance</div>
          </div>

          <div className="divide-y divide-border">
            {groups.map(([section, pages]) => {
              const isCollapsed = collapsedGroups.includes(section);
              const enabledInGroup = pages.filter((page) =>
                enabledKeys.includes(page.key),
              ).length;

              return (
                <section key={section} aria-label={section} className="bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-card px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1.8fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)]">
                    <button
                      type="button"
                      onClick={() => toggleGroup(section)}
                      aria-label={`${isCollapsed ? "Buka" : "Tutup"} ${section}`}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                        <ChevronDown
                          className={[
                            "size-3.5 transition-transform",
                            isCollapsed ? "-rotate-90" : "",
                          ].join(" ")}
                        />
                      </span>
                      <span className="truncate text-[14px] font-black uppercase tracking-[0.04em] text-card-foreground">
                        {section}
                      </span>
                      {enabledInGroup > 0 && (
                        <span className="shrink-0 rounded-full bg-lightsecondary px-2 py-0.5 text-[10px] font-bold text-secondary">
                          {enabledInGroup} maintenance
                        </span>
                      )}
                    </button>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {pages.length} halaman
                    </span>
                    <span className="text-right text-xs font-medium text-muted-foreground">
                      {enabledInGroup > 0 ? "Sebagian aktif" : "Normal"}
                    </span>
                  </div>

                  {!isCollapsed &&
                    pages.map((page) => {
                      const isEnabled = enabledKeys.includes(page.key);
                      const isManageable =
                        canManage && page.manageable !== false;
                      const query = page.query
                        ? `?${new URLSearchParams(page.query).toString()}`
                        : "";

                      return (
                        <div
                          key={page.key}
                          className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1.8fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)]"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <Folder className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold text-card-foreground">
                                  {page.name}
                                </span>
                                {isEnabled && (
                                  <span className="rounded-full bg-lightsecondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
                                    Maintenance
                                  </span>
                                )}
                              </div>
                              {page.description && (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {page.description}
                                </span>
                              )}
                              <code className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:hidden">
                                {page.path}
                                {query}
                              </code>
                            </div>
                          </div>

                          <code className="hidden truncate text-xs text-muted-foreground sm:block">
                            {page.path}
                            {query}
                          </code>

                          <div className="flex shrink-0 items-center justify-end gap-3">
                            <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                              {page.manageable === false
                                ? "Selalu aktif"
                                : isEnabled
                                  ? "Aktif"
                                  : "Normal"}
                            </span>
                            <Switch
                              checked={isEnabled}
                              disabled={!isManageable || pendingKey !== null}
                              aria-label={`Maintenance ${page.name}`}
                              onCheckedChange={(checked) =>
                                toggleMaintenance(page.key, checked)
                              }
                              className="data-[state=checked]:bg-secondary"
                            />
                          </div>
                        </div>
                      );
                    })}
                </section>
              );
            })}
          </div>
        </div>
        </TabsContent>

        <TabsContent value="menu-access" className="mt-0">
          <MenuAccessControl
            initialAccessMatrix={initialAccessMatrix}
            canManage={canManage}
          />
        </TabsContent>

        {usersDirectory && (
          <TabsContent value="users" className="mt-0">
            {usersDirectory}
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
