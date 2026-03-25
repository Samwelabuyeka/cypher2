import { useState } from "react";
import { useFindMany, useAction, useGlobalAction, useUser } from "@gadgetinc/react";
import { api } from "../api";
import { AutoTable } from "@/components/auto";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Cpu, Zap, TrendingUp, Plus, Play, Square, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function MiningDashboard() {
  const user = useUser(api);
  const [startMiningDialogOpen, setStartMiningDialogOpen] = useState(false);
  const [addRigDialogOpen, setAddRigDialogOpen] = useState(false);
  const [selectedRigId, setSelectedRigId] = useState<string>("");
  
  // Fetch all mining rigs for stats
  const [{ data: allRigs, fetching: rigsLoading, error: rigsError }] = useFindMany(api.miningRig, {
    filter: { user: { id: { equals: user?.id } } },
    select: { id: true, status: true },
  });

  // Fetch all sessions for stats
  const [{ data: allSessions, fetching: sessionsLoading, error: sessionsError }] = useFindMany(api.miningSession, {
    filter: { user: { id: { equals: user?.id } } },
    select: { id: true, endedAt: true, coinsEarned: true, profit: true },
    first: 250,
  });

  // Fetch available rigs for the start mining dialog
  const [{ data: availableRigs }] = useFindMany(api.miningRig, {
    filter: {
      AND: [
        { user: { id: { equals: user?.id } } },
        { status: { equals: "idle" } }
      ]
    },
    select: { id: true, name: true, type: true, algorithm: true },
  });

  // Actions
  const [{ fetching: startingMining }, startMiningSession] = useGlobalAction(api.startMiningSession);
  const [{ fetching: creatingRig }, createRig] = useAction(api.miningRig.create);
  const [{ fetching: updatingSession }, updateSession] = useAction(api.miningSession.update);

  // Form states for add rig dialog
  const [rigName, setRigName] = useState("");
  const [rigType, setRigType] = useState<"gpu" | "asic" | "cpu">("gpu");
  const [rigHashrate, setRigHashrate] = useState("");
  const [rigHashrateUnit, setRigHashrateUnit] = useState("MH/s");
  const [rigPowerConsumption, setRigPowerConsumption] = useState("");
  const [rigAlgorithm, setRigAlgorithm] = useState("ethash");

  // Calculate stats
  const totalRigs = allRigs?.length || 0;
  const activeRigs = allRigs?.filter(rig => rig.status === "mining").length || 0;
  const activeSessions = allSessions?.filter(session => !session.endedAt).length || 0;
  const totalCoinsMined = allSessions?.reduce((sum, session) => sum + (session.coinsEarned || 0), 0) || 0;
  const totalProfit = allSessions?.reduce((sum, session) => sum + (session.profit || 0), 0) || 0;

  const handleStartMining = async () => {
    if (!selectedRigId) {
      toast.error("Please select a mining rig");
      return;
    }

    try {
      toast.info("Starting mining session... This will take about 60 seconds");
      const result = await startMiningSession({ userId: user?.id });
      
      if (result.data?.success) {
        toast.success("Mining session started successfully!");
        setStartMiningDialogOpen(false);
        setSelectedRigId("");
      } else {
        toast.error("Failed to start mining session");
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  const handleAddRig = async () => {
    if (!rigName || !rigHashrate || !rigPowerConsumption) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await createRig({
        name: rigName,
        type: rigType,
        hashrate: parseFloat(rigHashrate),
        hashrateUnit: rigHashrateUnit,
        powerConsumption: parseFloat(rigPowerConsumption),
        algorithm: rigAlgorithm,
        user: { _link: user?.id },
      });

      toast.success("Mining rig added successfully!");
      setAddRigDialogOpen(false);
      setRigName("");
      setRigHashrate("");
      setRigPowerConsumption("");
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await updateSession({
        id: sessionId,
        endedAt: new Date().toISOString(),
      });
      toast.success("Mining session stopped");
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  if (rigsLoading || sessionsLoading) {
    return <div className="p-8">Loading mining dashboard...</div>;
  }

  if (rigsError || sessionsError) {
    return <div className="p-8 text-red-500">Error loading mining data</div>;
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header Section */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Mining Operations</h1>
        <p className="text-muted-foreground">Monitor and manage your crypto mining operations</p>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mining Rigs</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRigs}</div>
            <p className="text-xs text-muted-foreground">{activeRigs} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSessions}</div>
            <p className="text-xs text-muted-foreground">Currently mining</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Coins Mined</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCoinsMined.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">All time earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalProfit.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">After costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4">
        <Button onClick={() => setStartMiningDialogOpen(true)}>
          <Play className="mr-2 h-4 w-4" />
          Start New Mining Session
        </Button>
        <Button variant="outline" onClick={() => setAddRigDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Mining Rig
        </Button>
        <Button variant="outline">
          <TrendingUp className="mr-2 h-4 w-4" />
          View Profitability
        </Button>
      </div>

      {/* Mining Rigs Section */}
      <Card>
        <CardHeader>
          <CardTitle>Mining Rigs</CardTitle>
          <CardDescription>Manage your mining hardware</CardDescription>
        </CardHeader>
        <CardContent>
          <AutoTable
            model={api.miningRig}
            filter={{ user: { id: { equals: user?.id } } }}
            columns={[
              "name",
              {
                header: "Type",
                field: "type",
              },
              {
                header: "Status",
                render: ({ record }) => (
                  <Badge
                    variant={
                      record.status === "mining"
                        ? "default"
                        : record.status === "idle"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {record.status}
                  </Badge>
                ),
              },
              {
                header: "Hashrate",
                render: ({ record }) => (
                  <span>
                    {record.hashrate} {record.hashrateUnit}
                  </span>
                ),
              },
              {
                header: "Power",
                field: "powerConsumption",
              },
              "algorithm",
              {
                header: "Actions",
                render: ({ record }) => (
                  <Button
                    size="sm"
                    disabled={record.status !== "idle"}
                    onClick={() => {
                      setSelectedRigId(record.id);
                      setStartMiningDialogOpen(true);
                    }}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Start Mining
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Active Mining Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Active Mining Sessions</CardTitle>
          <CardDescription>Currently running mining operations</CardDescription>
        </CardHeader>
        <CardContent>
          <AutoTable
            model={api.miningSession}
            filter={{
              AND: [
                { user: { id: { equals: user?.id } } },
                { endedAt: { isSet: false } }
              ]
            }}
            columns={[
              "id",
              "coin",
              "algorithm",
              {
                header: "Started",
                render: ({ record }) => (
                  <span>{new Date(record.startedAt).toLocaleString()}</span>
                ),
              },
              {
                header: "Acceptance Rate",
                render: ({ record }) => {
                  const rate = record.sharesSubmitted > 0
                    ? ((record.sharesAccepted / record.sharesSubmitted) * 100).toFixed(1)
                    : "0";
                  return <span>{rate}%</span>;
                },
              },
              "coinsEarned",
              "revenue",
              "profit",
              {
                header: "Status",
                render: () => <Badge>Active</Badge>,
              },
              {
                header: "Actions",
                render: ({ record }) => (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleStopSession(record.id)}
                    disabled={updatingSession}
                  >
                    <Square className="mr-1 h-3 w-3" />
                    Stop
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Mining History */}
      <Card>
        <CardHeader>
          <CardTitle>Mining History</CardTitle>
          <CardDescription>Completed mining sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <AutoTable
            model={api.miningSession}
            filter={{
              AND: [
                { user: { id: { equals: user?.id } } },
                { endedAt: { isSet: true } }
              ]
            }}
            columns={[
              "coin",
              {
                header: "Started",
                render: ({ record }) => (
                  <span>{new Date(record.startedAt).toLocaleString()}</span>
                ),
              },
              {
                header: "Ended",
                render: ({ record }) => (
                  <span>{new Date(record.endedAt).toLocaleString()}</span>
                ),
              },
              {
                header: "Duration (min)",
                render: ({ record }) => {
                  const duration = record.duration || 0;
                  return <span>{Math.round(duration / 60)}</span>;
                },
              },
              "sharesAccepted",
              "coinsEarned",
              "revenue",
              "profit",
              {
                header: "Efficiency",
                render: ({ record }) => {
                  const efficiency = (record.efficiency || 0) * 100;
                  return <span>{efficiency.toFixed(1)}%</span>;
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Start Mining Dialog */}
      <Dialog open={startMiningDialogOpen} onOpenChange={setStartMiningDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Mining Session</DialogTitle>
            <DialogDescription>
              Select a mining rig to start a new mining session. The session will run for 60 seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rig-select">Mining Rig</Label>
              <Select value={selectedRigId} onValueChange={setSelectedRigId}>
                <SelectTrigger id="rig-select">
                  <SelectValue placeholder="Select a mining rig" />
                </SelectTrigger>
                <SelectContent>
                  {availableRigs?.map((rig) => (
                    <SelectItem key={rig.id} value={rig.id}>
                      {rig.name} ({rig.type} - {rig.algorithm})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartMiningDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartMining} disabled={startingMining || !selectedRigId}>
              {startingMining ? "Starting..." : "Start Mining"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rig Dialog */}
      <Dialog open={addRigDialogOpen} onOpenChange={setAddRigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Mining Rig</DialogTitle>
            <DialogDescription>
              Add a new mining rig to your operations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rig-name">Name</Label>
              <Input
                id="rig-name"
                value={rigName}
                onChange={(e) => setRigName(e.target.value)}
                placeholder="My Mining Rig"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rig-type">Type</Label>
              <Select value={rigType} onValueChange={(value: "gpu" | "asic" | "cpu") => setRigType(value)}>
                <SelectTrigger id="rig-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpu">GPU</SelectItem>
                  <SelectItem value="asic">ASIC</SelectItem>
                  <SelectItem value="cpu">CPU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rig-hashrate">Hashrate</Label>
                <Input
                  id="rig-hashrate"
                  type="number"
                  value={rigHashrate}
                  onChange={(e) => setRigHashrate(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rig-hashrate-unit">Unit</Label>
                <Select value={rigHashrateUnit} onValueChange={setRigHashrateUnit}>
                  <SelectTrigger id="rig-hashrate-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H/s">H/s</SelectItem>
                    <SelectItem value="KH/s">KH/s</SelectItem>
                    <SelectItem value="MH/s">MH/s</SelectItem>
                    <SelectItem value="GH/s">GH/s</SelectItem>
                    <SelectItem value="TH/s">TH/s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rig-power">Power Consumption (Watts)</Label>
              <Input
                id="rig-power"
                type="number"
                value={rigPowerConsumption}
                onChange={(e) => setRigPowerConsumption(e.target.value)}
                placeholder="150"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rig-algorithm">Algorithm</Label>
              <Select value={rigAlgorithm} onValueChange={setRigAlgorithm}>
                <SelectTrigger id="rig-algorithm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethash">Ethash</SelectItem>
                  <SelectItem value="kawpow">KawPow</SelectItem>
                  <SelectItem value="autolykos2">Autolykos2</SelectItem>
                  <SelectItem value="etchash">Etchash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRig} disabled={creatingRig}>
              {creatingRig ? "Adding..." : "Add Rig"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}