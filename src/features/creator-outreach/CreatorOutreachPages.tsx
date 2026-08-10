import { useState } from "react";

import { BulkSenderPage } from "@/features/bulk-sender/BulkSenderPage";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { CreatorOutreachAssistant } from "./CreatorOutreachAssistant";

type OutreachPage = "bulk-sender" | "translation";

export function CreatorOutreachPages() {
  const [page, setPage] = useState<OutreachPage>("bulk-sender");
  const switcher = <OutreachAssistantPagination page={page} onPageChange={setPage} />;

  return page === "bulk-sender" ? (
    <BulkSenderPage pageSwitcher={switcher} />
  ) : (
    <CreatorOutreachAssistant pageSwitcher={switcher} />
  );
}

function OutreachAssistantPagination({
  page,
  onPageChange,
}: {
  page: OutreachPage;
  onPageChange: (page: OutreachPage) => void;
}) {
  const pages: Array<{ id: OutreachPage; label: string; pageNumber: number }> = [
    { id: "bulk-sender", label: "Bulk Sender", pageNumber: 1 },
    { id: "translation", label: "Translation", pageNumber: 2 },
  ];
  const currentIndex = pages.findIndex((item) => item.id === page);
  const previous = pages[Math.max(0, currentIndex - 1)].id;
  const next = pages[Math.min(pages.length - 1, currentIndex + 1)].id;

  return (
    <Pagination className="justify-start">
      <PaginationContent className="rounded-lg border border-border bg-card p-1">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page === "bulk-sender"}
            className={page === "bulk-sender" ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              onPageChange(previous);
            }}
          />
        </PaginationItem>
        {pages.map((item) => (
          <PaginationItem key={item.id}>
            <PaginationLink
              href="#"
              isActive={page === item.id}
              aria-label={`Open ${item.label} page`}
              title={item.label}
              onClick={(event) => {
                event.preventDefault();
                onPageChange(item.id);
              }}
            >
              {item.pageNumber}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page === "translation"}
            className={page === "translation" ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              onPageChange(next);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
