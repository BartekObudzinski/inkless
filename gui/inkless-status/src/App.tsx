import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Titlebar } from "./components/Titlebar";
import { PrintTab } from "./components/PrintTab";
import { PrintersTab } from "./components/PrintersTab";
import { DiscoverTab } from "./components/DiscoverTab";
import type { PrinterInfo } from "./types";

type TabId = "print" | "printers" | "discover";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("print");
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const loadPrinters = async () => {
    const result: PrinterInfo[] = await invoke("get_printers");
    setPrinters(result);
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  useEffect(() => {
    if (activeTab === "printers") {
      loadPrinters();
    }
  }, [activeTab]);

  const toggleTheme = () => setIsDark(!isDark);

  const tabs: { id: TabId; label: string }[] = [
    { id: "print", label: "Print" },
    { id: "printers", label: "Printers" },
    { id: "discover", label: "Discover" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-2 dark:bg-dark-1">
      <Titlebar isDark={isDark} onToggleTheme={toggleTheme} />

      <div className="flex-1 p-5 max-w-[500px] mx-auto w-full">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 mb-4 bg-surface-3 dark:bg-dark-2 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all border-none cursor-pointer
                ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-dark-3 shadow-md text-text-primary dark:text-text-dark-primary"
                    : "bg-transparent text-text-secondary hover:bg-black/5 dark:hover:bg-white/10"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "print" && (
          <PrintTab printers={printers} onRefresh={loadPrinters} />
        )}
        {activeTab === "printers" && (
          <PrintersTab printers={printers} onRefresh={loadPrinters} />
        )}
        {activeTab === "discover" && (
          <DiscoverTab onPrinterAdded={loadPrinters} />
        )}
      </div>
    </div>
  );
}
