import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PrinterInfo, CommandResult } from "../types";

interface Props {
  printers: PrinterInfo[];
  onRefresh: () => void;
}

export function PrintersTab({ printers, onRefresh }: Props) {
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);

  useEffect(() => {
    setDefaultPrinter(localStorage.getItem("defaultPrinter"));
  }, []);

  const handleSetDefault = (name: string) => {
    localStorage.setItem("defaultPrinter", name);
    setDefaultPrinter(name);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove printer "${name}"?`)) return;

    try {
      const result: CommandResult = await invoke("remove_printer", { name });
      if (result.success) {
        // Clear default if removed printer was default
        if (defaultPrinter === name) {
          localStorage.removeItem("defaultPrinter");
          setDefaultPrinter(null);
        }
        onRefresh();
      }
    } catch (err) {
      alert(`Failed to remove printer: ${err}`);
    }
  };

  const getStatusClasses = (status: string) => {
    switch (status.toLowerCase()) {
      case "idle":
      case "ready":
        return "bg-status-success text-status-success-text";
      case "printing":
        return "bg-status-warning text-status-warning-text";
      default:
        return "bg-surface-3 dark:bg-dark-3 text-text-secondary";
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 text-text-primary dark:text-text-dark-primary">
        Configured Printers
      </h2>

      <div className="flex flex-col gap-3">
        {printers.length === 0 ? (
          <p className="text-center text-text-secondary py-5 text-sm">
            No printers configured
          </p>
        ) : (
          printers.map((printer) => {
            const isDefault = defaultPrinter === printer.name;
            return (
              <div
                key={printer.name}
                className={`flex items-center justify-between p-3 rounded-md ${
                  isDefault
                    ? "bg-accent/10 dark:bg-accent/20 ring-1 ring-accent/30"
                    : "bg-surface-2 dark:bg-dark-3"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-base font-semibold text-text-primary dark:text-text-dark-primary">
                      {printer.name}
                    </h4>
                    {isDefault && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent text-white">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary truncate">
                    {printer.uri}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${getStatusClasses(
                      printer.status
                    )}`}
                  >
                    {printer.status}
                  </span>
                  {!isDefault && (
                    <button
                      className="btn-secondary btn-small"
                      onClick={() => handleSetDefault(printer.name)}
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    className="btn-danger"
                    onClick={() => handleRemove(printer.name)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
