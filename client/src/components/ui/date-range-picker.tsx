/**
 * Date Range Picker Component
 * Provides preset options and custom date range selection with calendar
 */

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  type DateRangePreset,
  getDateRangeForPreset,
  getPresetLabel,
  formatDateLocal,
  type DateRange,
} from "@/lib/date-utils";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>("custom");
  const [startDate, setStartDate] = useState<Date | undefined>(
    value.startDate ? new Date(value.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    value.endDate ? new Date(value.endDate) : undefined
  );
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);

  useEffect(() => {
    if (preset !== "custom") {
      if (isStartOpen) setIsStartOpen(false);
      if (isEndOpen) setIsEndOpen(false);
    }
  }, [preset, isStartOpen, isEndOpen]);

  // Sync local state with value prop
  useEffect(() => {
    if (value.startDate) {
      setStartDate(new Date(value.startDate));
    }
    if (value.endDate) {
      setEndDate(new Date(value.endDate));
    }
  }, [value.startDate, value.endDate]);

  // Detect current preset based on value
  useEffect(() => {
    const presets: DateRangePreset[] = [
      "today",
      "yesterday",
      "thisWeek",
      "lastWeek",
      "thisMonth",
      "lastMonth",
      "thisYear",
      "lastYear",
    ];

    for (const p of presets) {
      const presetRange = getDateRangeForPreset(p);
      if (
        presetRange.startDate === value.startDate &&
        presetRange.endDate === value.endDate
      ) {
        setPreset(p);
        return;
      }
    }
    setPreset("custom");
  }, [value]);

  const handlePresetChange = (newPreset: DateRangePreset) => {
    if (newPreset !== "custom") {
      if (isStartOpen) setIsStartOpen(false);
      if (isEndOpen) setIsEndOpen(false);
    }
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const range = getDateRangeForPreset(newPreset);
      onChange(range);
      setStartDate(range.startDate ? new Date(range.startDate) : undefined);
      setEndDate(range.endDate ? new Date(range.endDate) : undefined);
    }
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return;
    setStartDate(date);
    setPreset("custom");
    const start = formatDateLocal(date);
    const end = endDate ? formatDateLocal(endDate) : start;
    onChange({ startDate: start, endDate: end });
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;
    setEndDate(date);
    setPreset("custom");
    const end = formatDateLocal(date);
    const start = startDate ? formatDateLocal(startDate) : end;
    onChange({ startDate: start, endDate: end });
  };

  const presets: DateRangePreset[] = [
    "today",
    "yesterday",
    "thisWeek",
    "lastWeek",
    "thisMonth",
    "lastMonth",
    "thisYear",
    "lastYear",
    "custom",
  ];

  return (
    <div className={cn("flex flex-col sm:flex-row gap-2 items-start", className)}>
      {/* Preset Selector */}
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as DateRangePreset)}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Période" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {getPresetLabel(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom Date Range (kept mounted for portal stability) */}
      <div
        className={cn(
          "flex gap-2 transition-opacity",
          preset === "custom" ? "opacity-100" : "opacity-0 pointer-events-none w-0 overflow-hidden"
        )}
        aria-hidden={preset !== "custom"}
      >
          {/* Start Date */}
          <Popover
            open={preset === "custom" && isStartOpen}
            onOpenChange={(open) => {
              if (preset === "custom") setIsStartOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-[200px] justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? (
                  format(startDate, "PPP", { locale: fr })
                ) : (
                  <span>Date début</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  handleStartDateChange(date);
                  setIsStartOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* End Date */}
          <Popover
            open={preset === "custom" && isEndOpen}
            onOpenChange={(open) => {
              if (preset === "custom") setIsEndOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-[200px] justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? (
                  format(endDate, "PPP", { locale: fr })
                ) : (
                  <span>Date fin</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => {
                  handleEndDateChange(date);
                  setIsEndOpen(false);
                }}
                initialFocus
                disabled={(date) => {
                  if (startDate) {
                    return date < startDate;
                  }
                  return false;
                }}
              />
            </PopoverContent>
          </Popover>
      </div>

      {/* Display selected range when not custom */}
      {preset !== "custom" && (
        <div className="flex items-center gap-2 text-sm text-foreground px-3 py-2 bg-muted rounded-md border min-w-[200px]">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">
            {value.startDate === value.endDate
              ? format(new Date(value.startDate), "PPP", { locale: fr })
              : `${format(new Date(value.startDate), "PPP", { locale: fr })} - ${format(new Date(value.endDate), "PPP", { locale: fr })}`}
          </span>
        </div>
      )}
    </div>
  );
}

