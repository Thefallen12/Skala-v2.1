"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Construction, Folder } from "lucide-react";
import {
  togglePageMaintenance,
  type MenuAccessMatrixRow,
} from "@/app/actions/settings";
import { MAINTENANCE_PAGES } from "@/lib/config/maintenance-pages";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
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

    startTransition(async () => {
      try {
        const result = await togglePageMaintenance(pageKey, enabled);
        if (!result.success) {
          setEnabledKeys(previousKeys);
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Updating page maintenance failed:", error);
        setEnabledKeys(previousKeys);
        toast.error("Gagal menyimpan status maintenance halaman.");
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
    <div className="space-y-4">
      <PageHeader
        title="Pengaturan Sistem"
        description="Kelola hak akses menu, pengguna, dan status maintenance aplikasi."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Pengaturan" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="lightSecondary" className="gap-1.5 px-3 py-1">
              <Construction className="size-3.5" aria-hidden="true" />
              {enabledKeys.length} maintenance
            </Badge>
            <Badge variant="gray" className="px-3 py-1">
              {initialAccessMatrix.length} menu terdaftar
            </Badge>
          </div>
        }
      />

      <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xs md:p-5">
        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 border border-border bg-muted p-1 sm:w-fit">
            <TabsTrigger value="menu-access">Hak Akses Menu</TabsTrigger>
            {usersDirectory && (
              <TabsTrigger value="users">Manajemen Pengguna</TabsTrigger>
            )}
            <TabsTrigger value="maintenance">Status Maintenance</TabsTrigger>
          </TabsList>

          <TabsContent value="maintenance" className="mt-0 space-y-4">
            <p className="type-p3 text-muted-foreground">
              Pengaturan Sistem selalu tersedia untuk memulihkan halaman.
            </p>

            {!canManage && (
              <p className="type-p2 rounded-lg border border-warning/30 bg-lightwarning px-4 py-3 text-warning">
                Anda dapat melihat status, tetapi hanya Direktur, Wakil Direktur,
                atau Administrasi yang dapat mengubah pengaturan.
              </p>
            )}

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
              <div className="border-b border-border bg-muted px-4 py-3 sm:px-5">
                <h2 className="type-h2 text-card-foreground">
                  Kontrol Navigasi &amp; Maintenance
                </h2>
              </div>

              <div className="type-p3 hidden grid-cols-[minmax(0,1.8fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-border bg-muted/70 font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
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
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                            <ChevronDown
                              className={[
                                "size-3.5 transition-transform",
                                isCollapsed ? "-rotate-90" : "",
                              ].join(" ")}
                              aria-hidden="true"
                            />
                          </span>
                          <h3 className="type-h3 truncate text-card-foreground">
                            {section}
                          </h3>
                          {enabledInGroup > 0 && (
                            <Badge variant="lightSecondary" className="shrink-0">
                              {enabledInGroup} maintenance
                            </Badge>
                          )}
                        </button>
                        <span className="type-p3 hidden text-muted-foreground sm:inline">
                          {pages.length} halaman
                        </span>
                        <span className="type-p3 text-right font-medium text-muted-foreground">
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
                                  <Folder className="size-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="type-p2 truncate font-semibold text-card-foreground">
                                      {page.name}
                                    </span>
                                    {isEnabled && (
                                      <Badge variant="lightSecondary">
                                        Maintenance
                                      </Badge>
                                    )}
                                  </div>
                                  {page.description && (
                                    <span className="type-p3 mt-0.5 block text-muted-foreground">
                                      {page.description}
                                    </span>
                                  )}
                                  <code className="type-p3 mt-0.5 block truncate text-muted-foreground sm:hidden">
                                    {page.path}
                                    {query}
                                  </code>
                                </div>
                              </div>

                              <code className="type-p3 hidden truncate text-muted-foreground sm:block">
                                {page.path}
                                {query}
                              </code>

                              <div className="flex shrink-0 items-center justify-end gap-3">
                                <span className="type-p2 font-medium text-muted-foreground">
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
            <TabsContent value="users" className="mt-0 [&>header]:hidden">
              {usersDirectory}
            </TabsContent>
          )}
        </Tabs>
      </section>
    </div>
  );
}
