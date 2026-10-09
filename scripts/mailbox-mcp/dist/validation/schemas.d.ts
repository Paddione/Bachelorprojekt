import * as v from "valibot";
export declare const sanitizeString: (str: string) => string;
export declare const sanitizeHtml: (html: string) => string;
export declare const searchEmailsSchema: v.ObjectSchema<{
    readonly query: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Search query must be a string">, v.MaxLengthAction<string, 500, "Search query too long">, v.TransformAction<string, string>]>, undefined>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "INBOX">;
    readonly since: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly before: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly limit: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Limit must be a number">, v.IntegerAction<number, "Limit must be an integer">, v.MinValueAction<number, 1, "Limit must be at least 1">, v.MaxValueAction<number, 1000, "Limit cannot exceed 1000">]>, 50>;
    readonly offset: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Offset must be a number">, v.IntegerAction<number, "Offset must be an integer">, v.MinValueAction<number, 0, "Offset cannot be negative">]>, 0>;
}, undefined>;
export declare const getEmailSchema: v.ObjectSchema<{
    readonly uid: v.SchemaWithPipe<readonly [v.NumberSchema<"UID must be a number">, v.IntegerAction<number, "UID must be an integer">, v.MinValueAction<number, 1, "UID must be positive">]>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "INBOX">;
}, undefined>;
export declare const getEmailThreadSchema: v.ObjectSchema<{
    readonly messageId: v.SchemaWithPipe<readonly [v.StringSchema<"Message ID must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Message ID cannot be empty">, v.MaxLengthAction<string, 255, "Message ID too long">, v.TransformAction<string, string>]>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "INBOX">;
}, undefined>;
export declare const sendEmailSchema: v.SchemaWithPipe<readonly [v.ObjectSchema<{
    readonly from: v.OptionalSchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, undefined>;
    readonly to: v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "Recipients must be an array">, v.MinLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 1, "At least one recipient is required">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many recipients">]>;
    readonly cc: v.OptionalSchema<v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "CC recipients must be an array">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many CC recipients">]>, undefined>;
    readonly bcc: v.OptionalSchema<v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "BCC recipients must be an array">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many BCC recipients">]>, undefined>;
    readonly subject: v.SchemaWithPipe<readonly [v.StringSchema<"Subject must be a string">, v.MaxLengthAction<string, 998, "Subject line too long">, v.TransformAction<string, string>]>;
    readonly text: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Text content must be a string">, v.MaxLengthAction<string, 1000000, "Text content too long">, v.TransformAction<string, string>]>, undefined>;
    readonly html: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"HTML content must be a string">, v.MaxLengthAction<string, 1000000, "HTML content too long">, v.TransformAction<string, string>]>, undefined>;
}, undefined>, v.CheckAction<{
    from?: {
        name?: string | undefined;
        address: string;
    } | undefined;
    to: {
        name?: string | undefined;
        address: string;
    }[];
    cc?: {
        name?: string | undefined;
        address: string;
    }[] | undefined;
    bcc?: {
        name?: string | undefined;
        address: string;
    }[] | undefined;
    subject: string;
    text?: string | undefined;
    html?: string | undefined;
}, "Either text or HTML content is required">]>;
export declare const createDraftSchema: v.ObjectSchema<{
    readonly to: v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "Recipients must be an array">, v.MinLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 1, "At least one recipient is required">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many recipients">]>;
    readonly cc: v.OptionalSchema<v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "CC recipients must be an array">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many CC recipients">]>, undefined>;
    readonly bcc: v.OptionalSchema<v.SchemaWithPipe<readonly [v.ArraySchema<v.ObjectSchema<{
        readonly name: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Name must be a string">, v.MaxLengthAction<string, 255, "Name too long">, v.TransformAction<string, string>]>, undefined>;
        readonly address: v.SchemaWithPipe<readonly [v.StringSchema<"Email must be a string">, v.TrimAction, v.EmailAction<string, "Invalid email format">, v.MaxLengthAction<string, 254, "Email address too long">, v.TransformAction<string, string>, v.TransformAction<string, string>]>;
    }, undefined>, "BCC recipients must be an array">, v.MaxLengthAction<{
        name?: string | undefined;
        address: string;
    }[], 100, "Too many BCC recipients">]>, undefined>;
    readonly subject: v.SchemaWithPipe<readonly [v.StringSchema<"Subject must be a string">, v.MaxLengthAction<string, 998, "Subject line too long">, v.TransformAction<string, string>]>;
    readonly text: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Text content must be a string">, v.MaxLengthAction<string, 1000000, "Text content too long">, v.TransformAction<string, string>]>, undefined>;
    readonly html: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"HTML content must be a string">, v.MaxLengthAction<string, 1000000, "HTML content too long">, v.TransformAction<string, string>]>, undefined>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "Drafts">;
}, undefined>;
export declare const moveEmailSchema: v.ObjectSchema<{
    readonly uid: v.SchemaWithPipe<readonly [v.NumberSchema<"UID must be a number">, v.IntegerAction<number, "UID must be an integer">, v.MinValueAction<number, 1, "UID must be positive">]>;
    readonly fromFolder: v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>;
    readonly toFolder: v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>;
}, undefined>;
export declare const markEmailSchema: v.ObjectSchema<{
    readonly uid: v.SchemaWithPipe<readonly [v.NumberSchema<"UID must be a number">, v.IntegerAction<number, "UID must be an integer">, v.MinValueAction<number, 1, "UID must be positive">]>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "INBOX">;
    readonly flags: v.SchemaWithPipe<readonly [v.ArraySchema<v.UnionSchema<[v.SchemaWithPipe<readonly [v.StringSchema<"Flag must be a string">, v.RegexAction<string, "Invalid email flag format">]>, v.PicklistSchema<["\\Seen", "\\Answered", "\\Flagged", "\\Deleted", "\\Draft", "\\Recent"], undefined>], undefined>, "Flags must be an array">, v.MinLengthAction<string[], 1, "At least one flag is required">, v.MaxLengthAction<string[], 10, "Too many flags">]>;
    readonly action: v.PicklistSchema<["add", "remove"], "Action must be 'add' or 'remove'">;
}, undefined>;
export declare const deleteEmailSchema: v.ObjectSchema<{
    readonly uid: v.SchemaWithPipe<readonly [v.NumberSchema<"UID must be a number">, v.IntegerAction<number, "UID must be an integer">, v.MinValueAction<number, 1, "UID must be positive">]>;
    readonly folder: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>, "INBOX">;
    readonly permanent: v.OptionalSchema<v.BooleanSchema<"Permanent must be a boolean">, false>;
}, undefined>;
export declare const createDirectorySchema: v.ObjectSchema<{
    readonly name: v.SchemaWithPipe<readonly [v.StringSchema<"Folder name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Folder name cannot be empty">, v.MaxLengthAction<string, 255, "Folder name too long">, v.CheckAction<string, "Invalid folder name characters">, v.TransformAction<string, string>]>;
    readonly parentPath: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Parent path must be a string">, v.MaxLengthAction<string, 500, "Parent path too long">, v.TransformAction<string, string>]>, "">;
}, undefined>;
export declare const getCalendarEventsSchema: v.SchemaWithPipe<readonly [v.ObjectSchema<{
    readonly start: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly end: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly calendar: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Calendar name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Calendar name cannot be empty">, v.MaxLengthAction<string, 255, "Calendar name too long">, v.TransformAction<string, string>]>, undefined>;
    readonly limit: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Limit must be a number">, v.IntegerAction<number, "Limit must be an integer">, v.MinValueAction<number, 1, "Limit must be at least 1">, v.MaxValueAction<number, 500, "Limit cannot exceed 500">]>, 100>;
    readonly offset: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Offset must be a number">, v.IntegerAction<number, "Offset must be an integer">, v.MinValueAction<number, 0, "Offset cannot be negative">]>, 0>;
}, undefined>, v.CheckAction<{
    start?: string | undefined;
    end?: string | undefined;
    calendar?: string | undefined;
    limit: number;
    offset: number;
}, "Start date must be before end date">]>;
export declare const searchCalendarSchema: v.SchemaWithPipe<readonly [v.ObjectSchema<{
    readonly query: v.SchemaWithPipe<readonly [v.StringSchema<"Search query must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Search query cannot be empty">, v.MaxLengthAction<string, 500, "Search query too long">, v.TransformAction<string, string>]>;
    readonly start: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly end: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>, undefined>;
    readonly calendar: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Calendar name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Calendar name cannot be empty">, v.MaxLengthAction<string, 255, "Calendar name too long">, v.TransformAction<string, string>]>, undefined>;
    readonly limit: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Limit must be a number">, v.IntegerAction<number, "Limit must be an integer">, v.MinValueAction<number, 1, "Limit must be at least 1">, v.MaxValueAction<number, 200, "Limit cannot exceed 200">]>, 50>;
    readonly offset: v.OptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<"Offset must be a number">, v.IntegerAction<number, "Offset must be an integer">, v.MinValueAction<number, 0, "Offset cannot be negative">]>, 0>;
}, undefined>, v.CheckAction<{
    query: string;
    start?: string | undefined;
    end?: string | undefined;
    calendar?: string | undefined;
    limit: number;
    offset: number;
}, "Start date must be before end date">]>;
export declare const getFreeBusySchema: v.SchemaWithPipe<readonly [v.ObjectSchema<{
    readonly start: v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>;
    readonly end: v.SchemaWithPipe<readonly [v.StringSchema<"Date must be a string">, v.TrimAction, v.CheckAction<string, "Invalid date format - must be ISO 8601 (YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDTHH:mm:ss, etc.)">, v.CheckAction<string, "Invalid date - unable to parse">]>;
    readonly calendar: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<"Calendar name must be a string">, v.TrimAction, v.MinLengthAction<string, 1, "Calendar name cannot be empty">, v.MaxLengthAction<string, 255, "Calendar name too long">, v.TransformAction<string, string>]>, undefined>;
}, undefined>, v.CheckAction<{
    start: string;
    end: string;
    calendar?: string | undefined;
}, "Start date must be before end date">]>;
export type SearchEmailsInput = v.InferOutput<typeof searchEmailsSchema>;
export type GetEmailInput = v.InferOutput<typeof getEmailSchema>;
export type GetEmailThreadInput = v.InferOutput<typeof getEmailThreadSchema>;
export type SendEmailInput = v.InferOutput<typeof sendEmailSchema>;
export type CreateDraftInput = v.InferOutput<typeof createDraftSchema>;
export type MoveEmailInput = v.InferOutput<typeof moveEmailSchema>;
export type MarkEmailInput = v.InferOutput<typeof markEmailSchema>;
export type DeleteEmailInput = v.InferOutput<typeof deleteEmailSchema>;
export type CreateDirectoryInput = v.InferOutput<typeof createDirectorySchema>;
export type GetCalendarEventsInput = v.InferOutput<typeof getCalendarEventsSchema>;
export type SearchCalendarInput = v.InferOutput<typeof searchCalendarSchema>;
export type GetFreeBusyInput = v.InferOutput<typeof getFreeBusySchema>;
export declare function validateInput<T>(schema: v.GenericSchema<T>, input: unknown): T;
export declare function safeValidateInput<T>(schema: v.GenericSchema<T>, input: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
