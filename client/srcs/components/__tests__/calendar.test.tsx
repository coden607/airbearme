import { render, screen } from "@testing-library/react";
import { Calendar } from "@/components/ui/calendar";

describe("Calendar", () => {
  it("renders the calendar with navigation icons", () => {
    render(<Calendar />);

    const prevButton = screen.getByLabelText("Go to previous month");
    const nextButton = screen.getByLabelText("Go to next month");

    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
  });
});
