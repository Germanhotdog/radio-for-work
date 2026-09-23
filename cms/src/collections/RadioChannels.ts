import type { CollectionConfig } from "payload";

export const RadioChannels: CollectionConfig = {
  slug: "radio-channels",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "enabled", "sortOrder"],
    description: "Manage the channels displayed by the HK Radio player.",
  },
  defaultSort: "sortOrder",
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "band",
      type: "select",
      required: true,
      options: [
        { label: "FM", value: "FM" },
        { label: "AM", value: "AM" },
        { label: "Podcast", value: "Podcast" },
      ],
    },
    {
      name: "frequency",
      type: "text",
      admin: {
        description: "Optional display value, such as 92.6 MHz or 783 kHz.",
      },
    },
    {
      name: "streamUrl",
      type: "text",
      required: true,
      validate: (value: unknown) => {
        if (typeof value !== "string") return "A stream URL is required.";
        try {
          const url = new URL(value);
          if (url.protocol !== "https:") return "Stream URLs must use HTTPS.";
        } catch {
          return "Enter a valid HTTPS stream URL.";
        }
        return true;
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Lower numbers appear first.",
      },
    },
  ],
};
