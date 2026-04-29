import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoEditor } from "@/components/photo-editor";
import type { ImageAsset } from "@/lib/types";

const loadEditorSessionMock = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/editor-storage", () => ({
  loadEditorSession: loadEditorSessionMock,
  saveEditorSession: vi.fn(async () => undefined),
}));

describe("PhotoEditor", () => {
  beforeEach(() => {
    loadEditorSessionMock.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suggestions: [], groups: [] }),
      })),
    );
  });

  it("renders a persistent upload button and switches multi-action tools into subtool rail", async () => {
    render(<PhotoEditor />);

    expect(screen.getByRole("img", { name: "Nuro Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getByText("Import a photo to start editing")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Color/i }));

    expect(screen.getByRole("button", { name: /Filter$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mono$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Customize$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Style" })).toBeInTheDocument();
  });

  it("renders crop handles instead of numeric inputs for crop", async () => {
    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 1000,
      height: 800,
      createdAt: "now",
    };
    loadEditorSessionMock.mockResolvedValue({
      originalImage: image,
      currentImage: image,
      history: [
        {
          id: "op-1",
          toolId: "light",
          actionId: "import",
          label: "Import",
          image,
          createdAt: "now",
        },
      ],
      historyIndex: 0,
    });

    render(<PhotoEditor />);

    await screen.findByAltText("Current edit");
    await userEvent.click(screen.getByRole("button", { name: "Crop" }));

    expect(screen.getByTestId("crop-overlay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crop handle nw" })).toBeInTheDocument();
    expect(screen.queryByLabelText("X")).not.toBeInTheDocument();
  });

  it("shows traditional adjustment sliders for Light and Color actions", async () => {
    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 1000,
      height: 800,
      createdAt: "now",
    };
    loadEditorSessionMock.mockResolvedValue({
      originalImage: image,
      currentImage: image,
      history: [
        {
          id: "op-1",
          toolId: "light",
          actionId: "import",
          label: "Import",
          image,
          createdAt: "now",
        },
      ],
      historyIndex: 0,
    });

    render(<PhotoEditor />);

    await screen.findByAltText("Current edit");
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(screen.getByRole("button", { name: /^Exposure$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlights$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Black Point$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Brightness$/ }));

    expect(screen.getByRole("slider", { name: "Brightness adjustment" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: /Color/i }));
    expect(screen.getByRole("button", { name: /Vibrance$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Warmth$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tint$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Saturation$/ }));

    expect(screen.getByRole("slider", { name: "Saturation adjustment" })).toBeInTheDocument();
  });

  it("resizes the crop box when a crop handle is dragged", async () => {
    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 1000,
      height: 800,
      createdAt: "now",
    };
    loadEditorSessionMock.mockResolvedValue({
      originalImage: image,
      currentImage: image,
      history: [
        {
          id: "op-1",
          toolId: "light",
          actionId: "import",
          label: "Import",
          image,
          createdAt: "now",
        },
      ],
      historyIndex: 0,
    });

    render(<PhotoEditor />);

    await screen.findByAltText("Current edit");
    await userEvent.click(screen.getByRole("button", { name: "Crop" }));

    const cropBox = screen.getByTestId("crop-box");
    expect(cropBox).toHaveStyle({ width: "1000px" });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Crop handle e" }), {
      clientX: 1000,
      clientY: 400,
    });
    fireEvent.pointerMove(window, { clientX: 1100, clientY: 400 });
    fireEvent.pointerUp(window);

    expect(screen.getByTestId("crop-box")).toHaveStyle({ width: "1100px" });
  });

  it("refreshes all AI recommendations when an existing photo session loads", async () => {
    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 1000,
      height: 800,
      createdAt: "now",
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ groups: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    loadEditorSessionMock.mockResolvedValue({
      originalImage: image,
      currentImage: image,
      history: [
        {
          id: "op-1",
          toolId: "light",
          actionId: "import",
          label: "Import",
          image,
          createdAt: "now",
        },
      ],
      historyIndex: 0,
    });

    render(<PhotoEditor />);

    await screen.findByAltText("Current edit");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/suggestions/batch",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
