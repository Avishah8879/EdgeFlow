import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border-l-4 group-[.toaster]:rounded-lg group-[.toaster]:p-3 group-[.toaster]:shadow-lg group-[.toaster]:transition-all group-[.toaster]:duration-300 group-[.toaster]:ease-in-out hover:group-[.toaster]:scale-105",
          title: "group-[.toast]:text-xs group-[.toast]:font-semibold",
          description: "group-[.toast]:text-xs group-[.toast]:opacity-90",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:bg-green-100 dark:group-[.toaster]:bg-green-900 group-[.toaster]:border-green-500 dark:group-[.toaster]:border-green-700 group-[.toaster]:text-green-900 dark:group-[.toaster]:text-green-100 hover:group-[.toaster]:bg-green-200 dark:hover:group-[.toaster]:bg-green-800",
          error:
            "group-[.toaster]:bg-red-100 dark:group-[.toaster]:bg-red-900 group-[.toaster]:border-red-500 dark:group-[.toaster]:border-red-700 group-[.toaster]:text-red-900 dark:group-[.toaster]:text-red-100 hover:group-[.toaster]:bg-red-200 dark:hover:group-[.toaster]:bg-red-800",
          warning:
            "group-[.toaster]:bg-yellow-100 dark:group-[.toaster]:bg-yellow-900 group-[.toaster]:border-yellow-500 dark:group-[.toaster]:border-yellow-700 group-[.toaster]:text-yellow-900 dark:group-[.toaster]:text-yellow-100 hover:group-[.toaster]:bg-yellow-200 dark:hover:group-[.toaster]:bg-yellow-800",
          info:
            "group-[.toaster]:bg-blue-100 dark:group-[.toaster]:bg-blue-900 group-[.toaster]:border-blue-500 dark:group-[.toaster]:border-blue-700 group-[.toaster]:text-blue-900 dark:group-[.toaster]:text-blue-100 hover:group-[.toaster]:bg-blue-200 dark:hover:group-[.toaster]:bg-blue-800",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
