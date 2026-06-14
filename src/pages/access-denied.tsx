export default function AccessDeniedPage() {
  return (
    <div className="min-h-dvh grid place-items-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-6">
        <p className="text-2xl font-bold" style={{ color: "#1F3864" }}>CMB VSAQ</p>
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          Your account has not been granted access to this application.
          Contact your system administrator.
        </p>
      </div>
    </div>
  )
}
