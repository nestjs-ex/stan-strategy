export class StanRecord<TData = any> {
  constructor(
    public readonly data: TData
  ) { }
}

export class StanRecordBuilder<TData> {
  constructor(private data?: TData) {}

  public setData(data: TData): this {
    this.data = data;
    return this;
  }

  public build(): StanRecord {
    return new StanRecord(this.data);
  }
}
